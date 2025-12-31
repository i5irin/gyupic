import type { AppAction } from '../../state/appReducer';
import type { AppState, JobItem, ConvertSettings } from '../../state/jobTypes';
import type { ProcessingPipelineResult } from '../pipeline/processingPipeline';
import { WorkerPool, type WorkerPoolOptions } from './workerPool';

type Dispatch = (action: AppAction) => void;

type QueueManagerOptions = WorkerPoolOptions & {
  dispatch: Dispatch;
  getState: () => AppState;
  createObjectURL?: (file: File) => string;
  revokeObjectURL?: (url: string | undefined) => void;
};

type JobRunContext = {
  runId: number;
  settingsRev: number;
  settings: ConvertSettings;
  pickupId: AppState['pickupId'];
  deliveryId: AppState['deliveryId'];
};

export default class QueueManager {
  private readonly dispatch: Dispatch;

  private readonly getState: () => AppState;

  private readonly workerPool: WorkerPool;

  private readonly createObjectURL: (file: File) => string;

  private readonly revokeObjectURL: (url: string | undefined) => void;

  private readonly running = new Map<string, JobRunContext>();

  private disposed = false;

  constructor(options: QueueManagerOptions) {
    this.dispatch = options.dispatch;
    this.getState = options.getState;
    this.workerPool = new WorkerPool({
      maxConcurrency: options.maxConcurrency,
    });
    this.createObjectURL =
      options.createObjectURL ?? ((file) => URL.createObjectURL(file));
    this.revokeObjectURL =
      options.revokeObjectURL ??
      ((url) => {
        if (!url) return;
        try {
          URL.revokeObjectURL(url);
        } catch {
          // No operation needed
        }
      });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.running.clear();
    this.workerPool.terminate();
  }

  sync(): void {
    if (this.disposed) {
      return;
    }
    const state = this.getState();
    const capacity = this.workerPool.getCapacity();
    const available = capacity - this.running.size;
    if (available <= 0) {
      return;
    }

    const queued = state.items.filter(
      (item) => item.status === 'queued' && !this.running.has(item.id),
    );
    const slots = Math.min(available, queued.length);
    for (let i = 0; i < slots; i += 1) {
      this.startJob(queued[i], state);
    }
  }

  private startJob(item: JobItem, snapshotSource: AppState): void {
    const context: JobRunContext = {
      runId: snapshotSource.runId,
      settingsRev: snapshotSource.settingsRev,
      settings: snapshotSource.settings,
      pickupId: snapshotSource.pickupId,
      deliveryId: snapshotSource.deliveryId,
    };

    this.running.set(item.id, context);
    this.dispatch({ type: 'START_ITEM', id: item.id });

    const params = {
      sourceFile: item.src.file,
      jpegQuality: context.settings.jpegQuality,
      pickupId: context.pickupId,
      deliveryId: context.deliveryId,
      presetId: context.settings.presetId,
      metadataPolicyMode: context.settings.metadataPolicyMode,
    };

    this.workerPool
      .run(params)
      .then((result) => this.handleSuccess(item.id, context, result))
      .catch((error) => this.handleFailure(item.id, context, error))
      .finally(() => {
        this.running.delete(item.id);
        this.sync();
      });
  }

  private handleSuccess(
    itemId: string,
    context: JobRunContext,
    result: ProcessingPipelineResult,
  ): void {
    if (this.isCanceled(itemId)) {
      this.dispatch({ type: 'END_ITEM', id: itemId });
      return;
    }
    if (!this.isCurrentGeneration(context)) {
      this.handleGenerationMismatch(itemId);
      return;
    }

    const previewUrl = this.createObjectURL(result.file);

    if (this.isCanceled(itemId)) {
      this.revokeObjectURL(previewUrl);
      this.dispatch({ type: 'END_ITEM', id: itemId });
      return;
    }
    if (!this.isCurrentGeneration(context)) {
      this.revokeObjectURL(previewUrl);
      this.handleGenerationMismatch(itemId);
      return;
    }

    this.dispatch({
      type: 'FINISH_ITEM',
      id: itemId,
      out: {
        file: result.file,
        previewUrl,
        sizeBefore: result.sizeBefore,
        sizeAfter: result.sizeAfter,
        reductionRatio: result.reductionRatio,
        metadata: result.metadata,
      },
      warningReason: result.warningReason,
    });
  }

  private handleFailure(
    itemId: string,
    context: JobRunContext,
    error: unknown,
  ): void {
    if (this.isCanceled(itemId)) {
      this.dispatch({ type: 'END_ITEM', id: itemId });
      return;
    }
    if (!this.isCurrentGeneration(context)) {
      this.handleGenerationMismatch(itemId);
      return;
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.dispatch({ type: 'FAIL_ITEM', id: itemId, error: message });
  }

  private isCanceled(itemId: string): boolean {
    const state = this.getState();
    const item = state.items.find((it) => it.id === itemId);
    return item?.status === 'canceled';
  }

  private isCurrentGeneration(context: JobRunContext): boolean {
    const state = this.getState();
    return (
      state.runId === context.runId && state.settingsRev === context.settingsRev
    );
  }

  private handleGenerationMismatch(itemId: string): void {
    const state = this.getState();
    const item = state.items.find((it) => it.id === itemId);
    if (!item) {
      return;
    }
    if (item.status === 'canceled') {
      this.dispatch({ type: 'END_ITEM', id: itemId });
      return;
    }
    this.dispatch({ type: 'REQUEUE_ITEM', id: itemId });
  }
}

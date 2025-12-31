import type { AppAction } from '../../state/appReducer';
import type {
  AppState,
  JobItem,
  ConvertSettings,
  JobErrorInfo,
} from '../../state/jobTypes';
import type { ProcessingPipelineResult } from '../pipeline/processingPipeline';
import { WorkerPool, type WorkerPoolOptions } from './workerPool';
import {
  ProcessingPipelineError,
  ProcessingAbortedError,
} from '../pipeline/processingErrors';
import { createPerfRecorder, type PerfRecorder } from '../../utils/perfTrace';

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

  private readonly canceledIds = new Set<string>();

  private readonly jobRecorders = new Map<string, PerfRecorder>();

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
    this.canceledIds.clear();
    this.jobRecorders.forEach((recorder, id) => {
      recorder.commit({ itemId: id, status: 'disposed' });
    });
    this.jobRecorders.clear();
  }

  cancelAllActive(reason?: string): void {
    if (this.disposed) {
      return;
    }
    const ids = Array.from(this.running.keys());
    ids.forEach((id) => {
      this.canceledIds.add(id);
      this.dispatch({ type: 'CANCEL_ITEM', id });
      this.finalizeJobRecorder(id, { status: 'cancelled' });
    });
    this.running.clear();
    this.workerPool.cancelAll(reason);
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
    this.recordQueueWait(item, context);
    const jobRecorder = this.createJobRecorder(item, context);
    if (jobRecorder) {
      this.jobRecorders.set(item.id, jobRecorder);
    }
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
        this.jobRecorders.delete(item.id);
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
      this.finalizeJobRecorder(itemId, { status: 'canceled-before-finish' });
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
      this.finalizeJobRecorder(itemId, {
        status: 'canceled-before-finish',
        hadOutput: true,
      });
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
    this.canceledIds.delete(itemId);
    this.finalizeJobRecorder(itemId, {
      status: result.warningReason ? 'warning' : 'success',
      sizeBefore: result.sizeBefore,
      sizeAfter: result.sizeAfter,
    });
  }

  private handleFailure(
    itemId: string,
    context: JobRunContext,
    error: unknown,
  ): void {
    if (error instanceof ProcessingAbortedError) {
      this.dispatch({ type: 'END_ITEM', id: itemId });
      this.canceledIds.delete(itemId);
      this.finalizeJobRecorder(itemId, { status: 'aborted' });
      return;
    }
    if (this.isCanceled(itemId)) {
      this.dispatch({ type: 'END_ITEM', id: itemId });
      this.canceledIds.delete(itemId);
      this.finalizeJobRecorder(itemId, { status: 'canceled-during-failure' });
      return;
    }
    if (!this.isCurrentGeneration(context)) {
      this.handleGenerationMismatch(itemId);
      return;
    }
    const jobError = this.createJobError(error);
    this.dispatch({ type: 'FAIL_ITEM', id: itemId, error: jobError });
    this.canceledIds.delete(itemId);
    this.finalizeJobRecorder(itemId, {
      status: 'error',
      errorCode: jobError.code,
    });
  }

  private isCanceled(itemId: string): boolean {
    if (this.canceledIds.has(itemId)) {
      return true;
    }
    const state = this.getState();
    const item = state.items.find((it) => it.id === itemId);
    if (item?.status === 'canceled') {
      this.canceledIds.add(itemId);
      return true;
    }
    return false;
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
      this.finalizeJobRecorder(itemId, {
        status: 'generation-mismatch-canceled',
      });
      return;
    }
    this.dispatch({ type: 'REQUEUE_ITEM', id: itemId });
    this.finalizeJobRecorder(itemId, { status: 'generation-mismatch' });
  }

  // eslint-disable-next-line class-methods-use-this
  private createJobError(error: unknown): JobErrorInfo {
    if (error instanceof ProcessingPipelineError) {
      return {
        code: error.code,
        message: error.message,
      };
    }
    if (error instanceof Error) {
      return {
        code: 'unknown',
        message: error.message,
      };
    }
    return {
      code: 'unknown',
      message: 'Unknown error',
    };
  }

  private recordQueueWait(item: JobItem, context: JobRunContext): void {
    const recorder = createPerfRecorder({
      scenario: 'queue.wait',
      pickupId: context.pickupId,
      deliveryId: context.deliveryId,
    });
    recorder?.commit({
      itemId: item.id,
      waitMs: Math.max(0, Date.now() - item.createdAt),
      runId: context.runId,
      settingsRev: context.settingsRev,
      pendingBeforeStart: this.workerPool.getPendingCount(),
    });
  }

  // eslint-disable-next-line class-methods-use-this
  private createJobRecorder(
    item: JobItem,
    context: JobRunContext,
  ): PerfRecorder | null {
    return createPerfRecorder({
      scenario: 'queue.job',
      pickupId: context.pickupId,
      deliveryId: context.deliveryId,
      runId: context.runId,
      settingsRev: context.settingsRev,
      itemId: item.id,
    });
  }

  private finalizeJobRecorder(
    itemId: string,
    extra: Record<string, unknown>,
  ): void {
    const recorder = this.jobRecorders.get(itemId);
    if (!recorder) {
      return;
    }
    recorder.commit({ itemId, ...extra });
    this.jobRecorders.delete(itemId);
  }
}

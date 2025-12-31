/* eslint-disable max-classes-per-file */
import { runProcessingPipeline } from '../pipeline/processingPipeline';
import type {
  ProcessingPipelineParams,
  ProcessingPipelineResult,
} from '../pipeline/processingPipeline';
import type {
  WorkerRequestMessage,
  WorkerResponseMessage,
} from './processingMessages';
import {
  ProcessingPipelineError,
  ProcessingAbortedError,
} from '../pipeline/processingErrors';

type ExecutorMode = 'main-thread' | 'worker';

export interface ProcessingExecutor {
  readonly mode: ExecutorMode;
  run(params: ProcessingPipelineParams): Promise<ProcessingPipelineResult>;
  terminate(): void;
}

// Toggle this constant manually when enabling/disabling the worker path
const FORCE_DISABLE_WORKER = false;

function isWorkerPipelineSupported(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const hasOffscreen =
    typeof OffscreenCanvas !== 'undefined' &&
    typeof window.createImageBitmap === 'function';
  return hasOffscreen;
}

class MainThreadProcessingExecutor implements ProcessingExecutor {
  public readonly mode: ExecutorMode = 'main-thread';

  // eslint-disable-next-line class-methods-use-this
  run(params: ProcessingPipelineParams): Promise<ProcessingPipelineResult> {
    return runProcessingPipeline(params);
  }

  // eslint-disable-next-line class-methods-use-this
  terminate(): void {
    // No operation
  }
}

class WorkerProcessingExecutor implements ProcessingExecutor {
  public readonly mode: ExecutorMode = 'worker';

  private worker: Worker;

  private pending = new Map<
    string,
    {
      resolve: (value: ProcessingPipelineResult) => void;
      reject: (reason: unknown) => void;
    }
  >();

  private seq = 0;

  constructor() {
    this.worker = new Worker(
      new URL('../../workers/processingWorker.ts', import.meta.url),
      {
        type: 'module',
      },
    );
    this.worker.addEventListener('message', (event) => {
      const data = event.data as WorkerResponseMessage;
      if (!data || !('jobId' in data)) {
        return;
      }
      const pending = this.pending.get(data.jobId);
      if (!pending) {
        return;
      }
      if (data.type === 'success') {
        pending.resolve(data.result);
      } else {
        const workerError = new ProcessingPipelineError(
          data.errorCode ?? 'unknown',
          data.reason,
        );
        pending.reject(workerError);
      }
      this.pending.delete(data.jobId);
    });
    this.worker.addEventListener('error', (event) => {
      // Fail all pending tasks immediately when the worker crashes
      this.pending.forEach(({ reject }) =>
        reject(
          new Error(
            `Worker error: ${event.message || 'unknown worker failure'}`,
          ),
        ),
      );
      this.pending.clear();
    });
  }

  run(params: ProcessingPipelineParams): Promise<ProcessingPipelineResult> {
    return new Promise((resolve, reject) => {
      this.seq += 1;
      const jobId = `job-${this.seq}`;
      this.pending.set(jobId, { resolve, reject });
      const message: WorkerRequestMessage = {
        type: 'process',
        jobId,
        payload: params,
      };
      this.worker.postMessage(message);
    });
  }

  terminate(): void {
    this.pending.forEach(({ reject }) =>
      reject(new ProcessingAbortedError('Worker executor terminated')),
    );
    this.pending.clear();
    this.worker.terminate();
  }
}

export function createProcessingExecutor(): ProcessingExecutor {
  if (FORCE_DISABLE_WORKER || !isWorkerPipelineSupported()) {
    return new MainThreadProcessingExecutor();
  }
  try {
    return new WorkerProcessingExecutor();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Worker executor unavailable, falling back.', error);
    return new MainThreadProcessingExecutor();
  }
}

import {
  createProcessingExecutor,
  type ProcessingExecutor,
} from './processingExecutor';
import type {
  ProcessingPipelineParams,
  ProcessingPipelineResult,
} from '../pipeline/processingPipeline';

type WorkerPoolTask = {
  params: ProcessingPipelineParams;
  resolve: (value: ProcessingPipelineResult) => void;
  reject: (reason: unknown) => void;
};

export type WorkerPoolOptions = {
  maxConcurrency?: number;
};

function inferDefaultConcurrency(): number {
  if (typeof navigator === 'undefined') {
    return 1;
  }
  const cores =
    typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 2;
  if (cores >= 6) {
    return 3;
  }
  if (cores >= 4) {
    return 2;
  }
  return 1;
}

export class WorkerPool {
  private executors: ProcessingExecutor[] = [];

  private taskQueue: WorkerPoolTask[] = [];

  private busyExecutors = new Set<number>();

  private terminated = false;

  private readonly capacity: number;

  constructor(options?: WorkerPoolOptions) {
    const desired =
      options?.maxConcurrency !== undefined && options.maxConcurrency > 0
        ? Math.floor(options.maxConcurrency)
        : inferDefaultConcurrency();

    const firstExecutor = createProcessingExecutor();
    this.executors.push(firstExecutor);

    if (firstExecutor.mode === 'worker') {
      const target = Math.max(1, desired);
      for (let i = 1; i < target; i += 1) {
        const executor = createProcessingExecutor();
        if (executor.mode !== 'worker') {
          executor.terminate();
          break;
        }
        this.executors.push(executor);
      }
    }

    this.capacity = this.executors.length;
  }

  getCapacity(): number {
    return this.capacity;
  }

  getBusyCount(): number {
    return this.busyExecutors.size;
  }

  getPendingCount(): number {
    return this.taskQueue.length;
  }

  run(params: ProcessingPipelineParams): Promise<ProcessingPipelineResult> {
    if (this.terminated) {
      return Promise.reject(new Error('WorkerPool is terminated'));
    }
    return new Promise<ProcessingPipelineResult>((resolve, reject) => {
      this.taskQueue.push({ params, resolve, reject });
      this.drainQueue();
    });
  }

  terminate(): void {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      task?.reject(new Error('WorkerPool is terminated'));
    }
    this.executors.forEach((executor) => executor.terminate());
    this.executors = [];
    this.busyExecutors.clear();
  }

  private drainQueue(): void {
    if (this.terminated) {
      return;
    }
    while (this.taskQueue.length > 0) {
      const idleIndex = this.executors.findIndex(
        (_, index) => !this.busyExecutors.has(index),
      );
      if (idleIndex === -1) {
        break;
      }
      const task = this.taskQueue.shift();
      if (!task) {
        break;
      }
      this.busyExecutors.add(idleIndex);
      const executor = this.executors[idleIndex];
      executor
        .run(task.params)
        .then(task.resolve, task.reject)
        .finally(() => {
          this.busyExecutors.delete(idleIndex);
          this.drainQueue();
        });
    }
  }
}

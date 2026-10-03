/// <reference lib="webworker" />

import { runProcessingPipeline } from '../core/pipeline/processingPipeline';
import type {
  WorkerRequestMessage,
  WorkerResponseMessage,
} from '../core/execution/processingMessages';

declare const self: DedicatedWorkerGlobalScope;

self.addEventListener(
  'message',
  async (event: MessageEvent<WorkerRequestMessage>) => {
    const { data } = event;
    if (!data || data.type !== 'process') {
      return;
    }
    try {
      const result = await runProcessingPipeline(data.payload);
      const response: WorkerResponseMessage = {
        type: 'success',
        jobId: data.jobId,
        result,
      };
      self.postMessage(response);
    } catch (error) {
      const response: WorkerResponseMessage = {
        type: 'error',
        jobId: data.jobId,
        reason: error instanceof Error ? error.message : 'Unknown worker error',
      };
      self.postMessage(response);
    }
  },
);

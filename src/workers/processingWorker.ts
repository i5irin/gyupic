/// <reference lib="webworker" />

import { runProcessingPipeline } from '../core/pipeline/processingPipeline';
import type {
  WorkerRequestMessage,
  WorkerResponseMessage,
} from '../core/execution/processingMessages';
import {
  ProcessingPipelineError,
  asProcessingPipelineError,
} from '../core/pipeline/processingErrors';

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
      const processingError =
        error instanceof ProcessingPipelineError
          ? error
          : asProcessingPipelineError(error, 'unknown', 'Unknown worker error');
      const response: WorkerResponseMessage = {
        type: 'error',
        jobId: data.jobId,
        reason: processingError.message,
        errorCode: processingError.code,
      };
      self.postMessage(response);
    }
  },
);

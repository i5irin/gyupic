/// <reference lib="webworker" />

import type {
  ProcessingPipelineParams,
  ProcessingPipelineResult,
} from '../core/pipeline/processingPipeline';

type WorkerRequestMessage = {
  type: 'process';
  jobId: string;
  payload: ProcessingPipelineParams;
};

type WorkerResponseMessage =
  | {
      type: 'success';
      jobId: string;
      result: ProcessingPipelineResult;
    }
  | {
      type: 'error';
      jobId: string;
      reason: string;
    };

declare const self: DedicatedWorkerGlobalScope;

self.addEventListener(
  'message',
  (event: MessageEvent<WorkerRequestMessage>) => {
    const { data } = event;
    if (!data || data.type !== 'process') {
      return;
    }
    // Processing inside Worker is not implemented yet; return explicit error
    const response: WorkerResponseMessage = {
      type: 'error',
      jobId: data.jobId,
      reason: 'Processing worker not implemented yet.',
    };
    self.postMessage(response);
  },
);

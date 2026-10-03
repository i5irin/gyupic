import type {
  ProcessingPipelineParams,
  ProcessingPipelineResult,
} from '../pipeline/processingPipeline';
import type { ProcessingErrorCode } from '../pipeline/processingErrors';

export type WorkerRequestMessage = {
  type: 'process';
  jobId: string;
  payload: ProcessingPipelineParams;
};

export type WorkerResponseMessage =
  | {
      type: 'success';
      jobId: string;
      result: ProcessingPipelineResult;
    }
  | {
      type: 'error';
      jobId: string;
      reason: string;
      errorCode?: ProcessingErrorCode;
    };

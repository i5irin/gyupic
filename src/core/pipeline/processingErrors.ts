/* eslint-disable max-classes-per-file */
export type ProcessingErrorCode =
  | 'load_source_failed'
  | 'convert_failed'
  | 'metadata_derive_failed'
  | 'metadata_apply_failed'
  | 'worker_unavailable'
  | 'aborted'
  | 'unknown';

export class ProcessingPipelineError extends Error {
  public readonly code: ProcessingErrorCode;

  public readonly causeError?: unknown;

  constructor(code: ProcessingErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ProcessingPipelineError';
    this.code = code;
    this.causeError = cause;
  }
}

export class ProcessingAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcessingAbortedError';
  }
}

export function asProcessingPipelineError(
  error: unknown,
  fallbackCode: ProcessingErrorCode,
  fallbackMessage: string,
): ProcessingPipelineError {
  if (error instanceof ProcessingPipelineError) {
    return error;
  }
  if (error instanceof Error) {
    return new ProcessingPipelineError(fallbackCode, error.message, error);
  }
  return new ProcessingPipelineError(fallbackCode, fallbackMessage, error);
}

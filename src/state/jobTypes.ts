import type {
  FilenameStrategy,
  FilenameTimestampSource,
  OutputFormat,
  PresetId,
  TimestampWriteMode,
} from '../domain/presets';
import type { MetadataWarning as CoreMetadataWarning } from '../core/metadata/wasmBridge';

export type JobStatus =
  | 'queued'
  | 'processing'
  | 'done'
  | 'warning'
  | 'error'
  | 'canceled';

export type JobSource = {
  file: File;
  previewUrl: string;
};

export type ExifTimestampField =
  | 'DateTimeOriginal'
  | 'DateTimeDigitized'
  | 'DateTime';

export type DerivedTimestamp =
  | {
      kind: 'exif';
      field: ExifTimestampField;
      value: string;
      offset?: string;
    }
  | { kind: 'file'; value: number; offset?: string }
  | { kind: 'unavailable' };

export type MetadataGuaranteeStatus =
  | 'guaranteed'
  | 'best-effort'
  | 'warning'
  | 'skipped';

export type MetadataWarning = CoreMetadataWarning;

export type JobMetadataInfo = {
  presetId: PresetId;
  derived: DerivedTimestamp;
  status: MetadataGuaranteeStatus;
  reason?: string;
  captureTimeBadge?: string;
};

export type JobErrorCode =
  | 'load_source_failed'
  | 'convert_failed'
  | 'metadata_derive_failed'
  | 'metadata_apply_failed'
  | 'worker_unavailable'
  | 'aborted'
  | 'unknown';

export type JobErrorInfo = {
  code: JobErrorCode;
  message: string;
};

export type JobOutput = {
  file: File;
  previewUrl: string;
  /** bytes */
  sizeBefore: number;
  /** bytes */
  sizeAfter: number;
  /** 0.0 - 1.0 (e.g. 0.42 means 42% smaller) */
  reductionRatio: number;
  metadata?: JobMetadataInfo;
};

export type JobItem = {
  id: string;
  createdAt: number;
  isNew: boolean;
  status: JobStatus;
  src: JobSource;
  out?: JobOutput;
  error?: JobErrorInfo;
  warnings?: MetadataWarning[];
  captured?: JobCaptureSnapshot;
};

export type ConvertSettings = {
  presetId: PresetId;
  jpegQuality: number;
  outputFormat: OutputFormat;
  filenameStrategy: FilenameStrategy;
  filenameTimestampSource: FilenameTimestampSource;
  timestampWriteMode: TimestampWriteMode;
};

export type AppState = {
  items: JobItem[];
  runId: number;
  settings: ConvertSettings;
  settingsRev: number;
  activeItemIds: string[];
  lastAddedIds: string[];
  presetId: PresetId;
};

export type JobCaptureSnapshot = {
  runId: number;
  settingsRev: number;
  presetId: PresetId;
  startedAt: number;
};

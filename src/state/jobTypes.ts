import ImageFile from '../models/image-file';
import type { DeliveryScenarioId } from '../domain/deliveryScenarios';

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
  imageFile: ImageFile;
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

export type JobMetadataInfo = {
  scenarioId: DeliveryScenarioId;
  derived: DerivedTimestamp;
  status: MetadataGuaranteeStatus;
  reason?: string;
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
  error?: string;
  warningReason?: string;
  captured?: JobCaptureSnapshot;
};

export type ConvertSettings = {
  jpegQuality: number;
};

export type AppState = {
  items: JobItem[];
  runId: number;
  settings: ConvertSettings;
  settingsRev: number;
  activeItemId: string | null;
  lastAddedIds: string[];
  deliveryScenarioId: DeliveryScenarioId;
};

export type JobCaptureSnapshot = {
  runId: number;
  settingsRev: number;
  deliveryScenarioId: DeliveryScenarioId;
  startedAt: number;
};

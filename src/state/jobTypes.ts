import ImageFile from '../models/image-file';

export type JobStatus = 'queued' | 'processing' | 'done' | 'error' | 'canceled';

export type JobSource = {
  file: File;
  previewUrl: string;
  imageFile: ImageFile;
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
};

export type JobItem = {
  id: string;
  createdAt: number;
  isNew: boolean;
  status: JobStatus;
  src: JobSource;
  out?: JobOutput;
  error?: string;
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
};

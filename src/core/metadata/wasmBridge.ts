import type {
  FilenameStrategy,
  OutputFormat,
  TimestampWriteMode,
} from '../../domain/presets';

export type MetadataSpecVersion = '1.0';

export type MetadataWarningCode =
  | 'META_MISSING_INPUT'
  | 'META_UNSUPPORTED_OUTPUT'
  | 'META_EXTRACT_FAILED'
  | 'META_APPLY_FAILED';

export type MetadataWarningField =
  | 'CAPTURE_TIME'
  | 'GPS'
  | 'XMP'
  | 'ADMIN_DATA'
  | 'OUTPUT_FILENAME';

export type MetadataWarningReason =
  | 'missing in input'
  | 'unsupported by output format'
  | 'failed to extract'
  | 'failed to apply';

export type MetadataWarning = {
  code: MetadataWarningCode;
  field: MetadataWarningField;
  reason: MetadataWarningReason;
  message: string;
};

const METADATA_WARNING_FIELD_LABELS: Record<MetadataWarningField, string> = {
  CAPTURE_TIME: 'Capture time',
  GPS: 'GPS',
  XMP: 'XMP',
  ADMIN_DATA: 'Administrative metadata',
  OUTPUT_FILENAME: 'Output filename',
};

export function buildMetadataWarningMessage(
  field: MetadataWarningField,
  reason: MetadataWarningReason,
): string {
  return `Couldn't preserve ${METADATA_WARNING_FIELD_LABELS[field]} (${reason}). Output image was created.`;
}

export type CaptureTimeSource = 'exif' | 'file' | 'unavailable';

export type DerivedCaptureTime = {
  source: CaptureTimeSource;
  value?: string;
  offsetMinutes?: number;
  timestampMs?: number;
};

export type DerivedMetadataResult = {
  metadataSpecVersion: MetadataSpecVersion;
  captureTime?: DerivedCaptureTime;
  warnings: MetadataWarning[];
};

export type MetadataDeriveContext = {
  captureTimeEnabled: boolean;
  timestampWriteMode: TimestampWriteMode;
  lastModifiedMs?: number;
};

export type MetadataAppliedFlags = {
  captureTime: boolean;
  gps: boolean;
  xmp: boolean;
  colorProfile: boolean;
  filenameStrategy: boolean;
};

export type ApplyMetadataResult = {
  metadataSpecVersion: MetadataSpecVersion;
  output: Uint8Array;
  appliedFlags: MetadataAppliedFlags;
  captureTimeBadge?: string;
  warnings: MetadataWarning[];
  nextLastModifiedMs?: number;
};

export type FilenamePlanResult = {
  metadataSpecVersion: MetadataSpecVersion;
  applied: boolean;
  targetName?: string;
  fallbackStrategy?: FilenameStrategy;
  timestampMs?: number;
  warnings: MetadataWarning[];
};

export type MetadataApplyContext = {
  captureTimeEnabled: boolean;
  captureTime?: DerivedCaptureTime;
  timestampWriteMode: TimestampWriteMode;
  needsCaptureTimeForFilenames: boolean;
  outputFormat: OutputFormat;
  fileNameOverride?: string;
  lastModifiedOverrideMs?: number;
  gpsEnabled: boolean;
  preserveXmp: boolean;
  preserveXmpManagement: boolean;
};

export type FilenamePlanContext = {
  sourceName: string;
  filenameStrategy: FilenameStrategy;
  timestampMs?: number;
  sanitizedBaseName?: string;
  outputFormat: OutputFormat;
};

export interface MetadataCoreBindings {
  metadata_spec_version(): string;
  derive_metadata(
    input: Uint8Array,
    context: MetadataDeriveContext,
  ): Promise<DerivedMetadataResult>;
  apply_metadata(
    encoded: Uint8Array,
    settings: MetadataApplyContext,
  ): Promise<ApplyMetadataResult>;
  plan_filename(context: FilenamePlanContext): Promise<FilenamePlanResult>;
}

type LoaderFn = () => Promise<MetadataCoreBindings>;

let loader: LoaderFn | null = null;
let cachedBindings: Promise<MetadataCoreBindings> | null = null;

/**
 * Register the loader entry point for the metadata WASM module.
 */
export function configureMetadataCoreLoader(next: LoaderFn): void {
  loader = next;
  cachedBindings = null;
}

/**
 * Lazily load the metadata WASM bindings.
 */
export async function getMetadataCore(): Promise<MetadataCoreBindings> {
  if (cachedBindings) {
    return cachedBindings;
  }
  if (!loader) {
    throw new Error('Metadata core loader is not configured yet.');
  }
  cachedBindings = loader();
  return cachedBindings;
}

/**
 * Reset cached bindings when rebuilding or hot-reloading the module.
 */
export function resetMetadataCoreCache(): void {
  cachedBindings = null;
}

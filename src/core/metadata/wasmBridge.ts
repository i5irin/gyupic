import type {
  FilenameStrategy,
  OutputFormat,
  OrderingRequirement,
  TimestampWriteMode,
} from '../../domain/presets';

export type MetadataSpecVersion = '1.0';

export type MetadataWarningCode =
  | 'META_MISSING_INPUT'
  | 'META_UNSUPPORTED_OUTPUT'
  | 'META_EXTRACT_FAILED'
  | 'META_APPLY_FAILED'
  | 'META_XMP_PRESERVE_FAILED'
  | 'META_MTIME_UNAVAILABLE'
  | 'ORDERING_REQUIREMENT_NOT_MET'
  | 'NOT_IMPLEMENTED';

export type MetadataWarning = {
  code: MetadataWarningCode;
  field: string;
  reason?: string;
  message: string;
};

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
  warnings: MetadataWarning[];
};

export type MetadataApplyContext = {
  captureTimeEnabled: boolean;
  captureTime?: DerivedCaptureTime;
  ordering: OrderingRequirement;
  timestampWriteMode: TimestampWriteMode;
  rewriteExif: boolean;
  injectFromEditedTime: boolean;
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

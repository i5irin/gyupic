import type {
  OrderingRequirement,
  OutputFormat,
  TimestampWriteMode,
} from '../../domain/presets';
import type {
  DerivedTimestamp,
  MetadataGuaranteeStatus,
} from '../../state/jobTypes';
import {
  applyTimestamp as applyLegacyMetadata,
  type ApplyResult as LegacyApplyResult,
  deriveTimestamp as deriveLegacyMetadata,
} from './metadataPolicy';
import type {
  DerivedCaptureTime,
  DerivedMetadataResult,
  MetadataApplyContext,
  MetadataWarning,
} from './wasmBridge';
import { getMetadataCore } from './wasmBridge';

type DeriveOptions = {
  file: File;
  captureTimeEnabled: boolean;
};

type ApplyOptions = {
  file: File;
  session: MetadataCoreDeriveSession;
  ordering: OrderingRequirement;
  timestampWriteMode: TimestampWriteMode;
  rewriteExif: boolean;
  injectFromEditedTime: boolean;
  outputFormat: OutputFormat;
  fileNameOverride?: string;
  lastModifiedOverrideMs?: number;
  gpsEnabled?: boolean;
  preserveXmp?: boolean;
  preserveXmpManagement?: boolean;
};

export type MetadataCoreDeriveSession = {
  mode: 'wasm' | 'fallback';
  captureTimeEnabled: boolean;
  derived: DerivedTimestamp;
  captureTime?: DerivedCaptureTime;
  warnings: MetadataWarning[];
};

export type MetadataCoreApplyResult = {
  file: File;
  status: MetadataGuaranteeStatus;
  warningReason?: string;
  warnings: MetadataWarning[];
  captureTimeBadge?: string;
};

function deriveLegacyBadge(
  result: LegacyApplyResult,
  ordering: OrderingRequirement,
): string {
  if (result.status === 'guaranteed') {
    return 'original';
  }
  if (result.status === 'best-effort') {
    return 'from-mtime';
  }
  if (ordering.sortingAxis === 'filename') {
    return 'filename-order';
  }
  return 'not-applied';
}

function mapLegacyApplyResult(
  result: LegacyApplyResult,
  ordering: OrderingRequirement,
): MetadataCoreApplyResult {
  return {
    file: result.file,
    status: result.status,
    warningReason: result.warningReason,
    warnings: result.warningReason
      ? [
          {
            code: 'NOT_IMPLEMENTED',
            field: 'capture-time',
            message: result.warningReason,
          } as MetadataWarning,
        ]
      : [],
    captureTimeBadge: deriveLegacyBadge(result, ordering),
  };
}

function minutesToOffset(minutes?: number): string | undefined {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) {
    return undefined;
  }
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60)
    .toString()
    .padStart(2, '0');
  const mins = Math.floor(abs % 60)
    .toString()
    .padStart(2, '0');
  return `${sign}${hours}:${mins}`;
}

function convertCaptureTimeToDerived(
  captureTime?: DerivedCaptureTime,
): DerivedTimestamp {
  if (!captureTime) {
    return { kind: 'unavailable' };
  }
  if (captureTime.source === 'exif' && captureTime.value) {
    return {
      kind: 'exif',
      field: 'DateTimeOriginal',
      value: captureTime.value,
      offset: minutesToOffset(captureTime.offsetMinutes),
    };
  }
  if (
    captureTime.source === 'file' &&
    typeof captureTime.timestampMs === 'number'
  ) {
    return {
      kind: 'file',
      value: captureTime.timestampMs,
      offset: minutesToOffset(captureTime.offsetMinutes),
    };
  }
  return { kind: 'unavailable' };
}

function mapDeriveResult(
  result: DerivedMetadataResult,
  captureTimeEnabled: boolean,
): MetadataCoreDeriveSession {
  return {
    mode: 'wasm',
    captureTimeEnabled,
    derived: convertCaptureTimeToDerived(result.captureTime),
    captureTime: result.captureTime,
    warnings: result.warnings,
  };
}

function buildDeriveContext(options: DeriveOptions): MetadataDeriveContext {
  return {
    captureTimeEnabled: options.captureTimeEnabled,
    lastModifiedMs: Number.isFinite(options.file.lastModified)
      ? options.file.lastModified
      : undefined,
  };
}

async function fileToUint8Array(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

async function tryDeriveWithWasm(
  options: DeriveOptions,
): Promise<MetadataCoreDeriveSession | null> {
  try {
    const bindings = await getMetadataCore();
    const inputBytes = await fileToUint8Array(options.file);
    const context = buildDeriveContext(options);
    const result = await bindings.derive_metadata(inputBytes, context);
    return mapDeriveResult(result, options.captureTimeEnabled);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('metadata-core: derive via WASM failed, falling back', error);
    return null;
  }
}

export async function deriveTimestampWithMetadataCore(
  options: DeriveOptions,
): Promise<MetadataCoreDeriveSession> {
  const wasmResult = await tryDeriveWithWasm(options);
  if (wasmResult) {
    return wasmResult;
  }
  const legacyDerived = await deriveLegacyMetadata({ file: options.file });
  return {
    mode: 'fallback',
    captureTimeEnabled: options.captureTimeEnabled,
    derived: legacyDerived,
    warnings: [],
  };
}

function buildApplyContext(options: ApplyOptions): MetadataApplyContext {
  return {
    captureTimeEnabled: options.session.captureTimeEnabled,
    captureTime: options.session.captureTime,
    ordering: options.ordering,
    timestampWriteMode: options.timestampWriteMode,
    rewriteExif: options.rewriteExif,
    injectFromEditedTime: options.injectFromEditedTime,
    outputFormat: options.outputFormat,
    fileNameOverride: options.fileNameOverride,
    lastModifiedOverrideMs: options.lastModifiedOverrideMs,
    gpsEnabled: Boolean(options.gpsEnabled),
    preserveXmp: Boolean(options.preserveXmp),
    preserveXmpManagement: Boolean(options.preserveXmpManagement),
  };
}

function buildFileFromWasmResponse(
  output: Uint8Array,
  options: ApplyOptions,
  response: MetadataApplyResult,
): File {
  const safeBytes = new Uint8Array(output);

  const blob = new Blob([safeBytes], {
    type: options.file.type || 'application/octet-stream',
  });
  const fileOptions: FilePropertyBag = {
    type: options.file.type || 'application/octet-stream',
  };
  if (
    typeof response.nextLastModifiedMs === 'number' &&
    Number.isFinite(response.nextLastModifiedMs)
  ) {
    fileOptions.lastModified = Math.trunc(response.nextLastModifiedMs);
  }
  const targetName = options.fileNameOverride || options.file.name;
  return new File([blob], targetName, fileOptions);
}

function evaluateGuaranteeStatus(options: {
  ordering: OrderingRequirement;
  derived: DerivedTimestamp;
  injectFromEditedTime: boolean;
  captureApplied: boolean;
  warnings: MetadataWarning[];
}): {
  status: MetadataGuaranteeStatus;
  warningReason?: string;
} {
  const { ordering, derived, injectFromEditedTime, captureApplied, warnings } =
    options;
  const needsExif = ordering.needsExif ?? ordering.sortingAxis === 'exif';
  const allowFallback =
    ordering.allowEditedTimeFallback ?? injectFromEditedTime;
  const derivedHasTime = derived.kind !== 'unavailable';
  const derivedIsExif = derived.kind === 'exif';
  const fallbackUsed =
    needsExif && !derivedIsExif && derivedHasTime && allowFallback;

  const success = needsExif ? captureApplied || fallbackUsed : true;

  if (!success) {
    return {
      status: 'warning',
      warningReason:
        warnings[0]?.message || 'Capture time could not be applied to output.',
    };
  }

  if (fallbackUsed) {
    return {
      status: 'best-effort',
      warningReason:
        'Best-effort: timestamp derived from edited/lastModified metadata.',
    };
  }

  if (ordering.sortingAxis === 'filename') {
    return {
      status: 'best-effort',
      warningReason:
        'Ordering is enforced via filename sorting; verify destination order.',
    };
  }

  return { status: 'guaranteed' };
}

async function tryApplyWithWasm(
  options: ApplyOptions,
): Promise<MetadataCoreApplyResult | null> {
  if (!options.session.captureTime && options.session.captureTimeEnabled) {
    return null;
  }
  try {
    const bindings = await getMetadataCore();
    const encodedBytes = await fileToUint8Array(options.file);
    const context = buildApplyContext(options);
    const response = await bindings.apply_metadata(encodedBytes, context);
    const file = buildFileFromWasmResponse(response.output, options, response);
    return {
      file,
      ...evaluateGuaranteeStatus({
        ordering: options.ordering,
        derived: options.session.derived,
        injectFromEditedTime: options.injectFromEditedTime,
        captureApplied: response.appliedFlags.captureTime,
        warnings: response.warnings,
      }),
      warnings: response.warnings,
      captureTimeBadge: response.captureTimeBadge,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('metadata-core: apply via WASM failed, falling back', error);
    return null;
  }
}

export async function applyMetadataWithMetadataCore(
  options: ApplyOptions,
): Promise<MetadataCoreApplyResult> {
  if (options.session.mode === 'wasm') {
    const wasmResult = await tryApplyWithWasm(options);
    if (wasmResult) {
      return wasmResult;
    }
  }

  const legacyResult = await applyLegacyMetadata({
    file: options.file,
    derived: options.session.derived,
    ordering: options.ordering,
    timestampWriteMode: options.timestampWriteMode,
    rewriteExif: options.rewriteExif,
    injectFromEditedTime: options.injectFromEditedTime,
    fileNameOverride: options.fileNameOverride,
    lastModifiedOverride: options.lastModifiedOverrideMs,
  });

  return mapLegacyApplyResult(legacyResult, options.ordering);
}

type MetadataDeriveContext = {
  captureTimeEnabled: boolean;
  lastModifiedMs?: number;
};

type MetadataApplyResult = {
  output: Uint8Array;
  appliedFlags: {
    captureTime: boolean;
  };
  warnings: MetadataWarning[];
  captureTimeBadge?: string;
  nextLastModifiedMs?: number;
};

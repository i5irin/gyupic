import exifr from 'exifr';
import piexif from 'piexifjs';
import type {
  MetadataOptions,
  MetadataSpecVersion,
  OrderingRequirement,
  TimestampWriteMode,
} from '../../domain/presets';
import type {
  DerivedTimestamp,
  MetadataWarning,
  MetadataWarningCode,
  CaptureTimeBadge,
  MetadataGuaranteeStatus,
} from '../../state/jobTypes';

const JPEG_MIME = 'image/jpeg';

const EXIF_TAGS = {
  DateTime: 0x0132,
  DateTimeOriginal: 0x9003,
  DateTimeDigitized: 0x9004,
  OffsetTime: 0x9010,
  OffsetTimeOriginal: 0x9011,
  OffsetTimeDigitized: 0x9012,
};

const EXIF_TIMESTAMP_FIELDS = [
  'DateTimeOriginal',
  'DateTimeDigitized',
  'DateTime',
] as const;

const EXIF_OFFSET_FIELDS = [
  'OffsetTimeOriginal',
  'OffsetTimeDigitized',
  'OffsetTime',
] as const;

const EXIF_PICK_FIELDS: string[] = [
  ...EXIF_TIMESTAMP_FIELDS,
  ...EXIF_OFFSET_FIELDS,
];

type DeriveOptions = {
  file: File;
};

type ApplyOptions = {
  file: File;
  derived: DerivedTimestamp;
  ordering: OrderingRequirement;
  timestampWriteMode: TimestampWriteMode;
  metadataOptions: MetadataOptions;
  metadataSpecVersion: MetadataSpecVersion;
  rewriteExif: boolean;
  injectFromEditedTime: boolean;
  fileNameOverride?: string;
  lastModifiedOverride?: number;
  sourceLastModified?: number;
};

export type ApplyResult = {
  file: File;
  status: MetadataGuaranteeStatus;
  warnings: MetadataWarning[];
  warningReason?: string;
  captureTimeBadge: CaptureTimeBadge;
};

type ExifTimestampField = (typeof EXIF_TIMESTAMP_FIELDS)[number];

type ReadExifResult = {
  field: ExifTimestampField;
  value: string;
  offset?: string;
};

function isExifCapable(file: File): boolean {
  return file.type?.toLowerCase().includes('jpeg');
}

function isExifWritable(file: File): boolean {
  return isExifCapable(file);
}

function formatExifLocalDate(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
}

function formatOffsetString(date: Date): string {
  const offsetMinutes = date.getTimezoneOffset() * -1;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${sign}${pad(hours)}:${pad(minutes)}`;
}

function buildExifDateStrings(
  derived: DerivedTimestamp,
): { primary: string; secondary: string; offset?: string } | null {
  if (derived.kind === 'exif') {
    return {
      primary: derived.value,
      secondary: derived.value,
      offset: derived.offset,
    };
  }
  if (derived.kind === 'file') {
    const date = new Date(derived.value);
    const primary = formatExifLocalDate(date);
    const offset = derived.offset || formatOffsetString(date);
    return {
      primary,
      secondary: primary,
      offset,
    };
  }
  return null;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read blob'));
    };
    reader.readAsDataURL(blob);
  });
}

function dataURLToBlob(dataUrl: string, mimeType: string): Blob {
  const [header, base64] = dataUrl.split(',');
  if (!base64) {
    throw new Error('Invalid data URL');
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const typeMatch = /data:(.*?);base64/.exec(header);
  const type = typeMatch?.[1] || mimeType || JPEG_MIME;
  return new Blob([bytes], { type });
}

function evaluateStatus(options: {
  success: boolean;
  ordering: OrderingRequirement;
  fallbackUsed?: boolean;
}): MetadataGuaranteeStatus {
  const { success, ordering, fallbackUsed } = options;
  if (!success) {
    return 'warning';
  }
  if (fallbackUsed) {
    return 'best-effort';
  }
  if (ordering.sortingAxis === 'filename') {
    return 'best-effort';
  }
  return 'guaranteed';
}

function createWarning(options: {
  code: MetadataWarningCode;
  field: string;
  reason: string;
}): MetadataWarning {
  const { code, field, reason } = options;
  return {
    code,
    field,
    reason,
    messageJa: `${field}を保持できませんでした（${reason}）。出力画像は作成済みです。`,
    messageEn: `Couldn't preserve ${field} (${reason}). Output image was created.`,
  };
}

export function parseExifDateTime(
  value: string,
  offset?: string,
): number | null {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/u.exec(
    value,
  );
  if (!match) {
    return null;
  }
  const [, year, month, day, hours, minutes, seconds] = match;
  const iso = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${
    offset ?? 'Z'
  }`;
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return timestamp;
}

function resolveLastModifiedFromDerived(
  derived: DerivedTimestamp,
): number | null {
  if (derived.kind === 'file') {
    return derived.value;
  }
  if (derived.kind === 'exif') {
    return parseExifDateTime(derived.value, derived.offset ?? undefined);
  }
  return null;
}

function normalizeExifValue(raw: unknown): string | null {
  if (!raw) {
    return null;
  }
  if (typeof raw === 'string') {
    return raw;
  }
  if (raw instanceof Date) {
    return formatExifLocalDate(raw);
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return formatExifLocalDate(new Date(raw));
  }
  return null;
}

async function readExifTimestampFromFile(
  file: File,
): Promise<ReadExifResult | null> {
  try {
    const metadata = await exifr.parse(file, {
      pick: EXIF_PICK_FIELDS,
    });
    if (!metadata) {
      return null;
    }

    const metadataRecord = metadata as Record<string, unknown>;
    const offsetValue = EXIF_OFFSET_FIELDS.map((field) => metadataRecord[field])
      .map((raw) => (typeof raw === 'string' ? raw : null))
      .find((val): val is string => Boolean(val));

    const found = EXIF_TIMESTAMP_FIELDS.map((field) => {
      const raw = metadataRecord[field];
      if (!raw) {
        return null;
      }
      const normalized = normalizeExifValue(raw);
      return normalized
        ? {
            field,
            value: normalized,
            ...(offsetValue ? { offset: offsetValue } : {}),
          }
        : null;
    }).find((entry): entry is ReadExifResult => entry !== null);
    if (found) {
      return found;
    }
  } catch {
    // noop: fall through to fallback
  }
  return null;
}

export async function deriveTimestamp({
  file,
}: DeriveOptions): Promise<DerivedTimestamp> {
  const exifTimestamp = await readExifTimestampFromFile(file);
  if (exifTimestamp) {
    return {
      kind: 'exif',
      field: exifTimestamp.field,
      value: exifTimestamp.value,
      offset: exifTimestamp.offset,
    };
  }

  if (Number.isFinite(file.lastModified) && file.lastModified > 0) {
    const fallbackDate = new Date(file.lastModified);
    return {
      kind: 'file',
      value: file.lastModified,
      offset: formatOffsetString(fallbackDate),
    };
  }

  return { kind: 'unavailable' };
}

export async function applyTimestamp({
  file,
  derived,
  ordering,
  timestampWriteMode,
  metadataOptions,
  metadataSpecVersion, // eslint-disable-line @typescript-eslint/no-unused-vars
  rewriteExif,
  injectFromEditedTime,
  fileNameOverride,
  lastModifiedOverride,
  sourceLastModified,
}: ApplyOptions): Promise<ApplyResult> {
  const needsExif = ordering.needsExif ?? ordering.sortingAxis === 'exif';
  const allowFallback =
    ordering.allowEditedTimeFallback ?? injectFromEditedTime;
  const captureTimeEnabled =
    metadataOptions.captureTimeEnabled &&
    rewriteExif &&
    timestampWriteMode !== 'off';

  const warnings: MetadataWarning[] = [];
  let captureTimeBadge: CaptureTimeBadge = 'not-applied';
  let fallbackUsed = false;
  let workingFile = file;

  if (!captureTimeEnabled) {
    if (needsExif) {
      warnings.push(
        createWarning({
          code: 'ORDERING_REQUIREMENT_NOT_MET',
          field: 'Capture Time',
          reason: 'Capture time disabled in settings',
        }),
      );
      return {
        file,
        status: 'warning',
        warnings,
        warningReason: warnings.map((w) => w.messageJa).join(' / '),
        captureTimeBadge,
      };
    }
    const status =
      ordering.sortingAxis === 'filename' ? 'best-effort' : 'skipped';
    return {
      file,
      status,
      warnings,
      captureTimeBadge,
    };
  }

  let effectiveDerived: DerivedTimestamp = derived;

  if (derived.kind === 'unavailable') {
    if (!allowFallback) {
      warnings.push(
        createWarning({
          code: 'META_MISSING_INPUT',
          field: 'Capture Time',
          reason: 'Exif capture time not found',
        }),
      );
      warnings.push(
        createWarning({
          code: 'ORDERING_REQUIREMENT_NOT_MET',
          field: 'Capture Time',
          reason: 'Exif capture time not found',
        }),
      );
      return {
        file,
        status: 'warning',
        warnings,
        warningReason: warnings.map((w) => w.messageJa).join(' / '),
        captureTimeBadge,
      };
    }
    if (
      typeof sourceLastModified === 'number' &&
      Number.isFinite(sourceLastModified)
    ) {
      effectiveDerived = {
        kind: 'file',
        value: sourceLastModified,
        offset: formatOffsetString(new Date(sourceLastModified)),
      };
      fallbackUsed = true;
      captureTimeBadge = 'from-mtime';
    } else {
      warnings.push(
        createWarning({
          code: 'META_MTIME_UNAVAILABLE',
          field: 'Capture Time',
          reason: 'Edited timestamp unavailable',
        }),
      );
      warnings.push(
        createWarning({
          code: 'ORDERING_REQUIREMENT_NOT_MET',
          field: 'Capture Time',
          reason: 'Edited timestamp unavailable',
        }),
      );
      return {
        file,
        status: 'warning',
        warnings,
        warningReason: warnings.map((w) => w.messageJa).join(' / '),
        captureTimeBadge,
      };
    }
  }

  if (timestampWriteMode === 'fromFileModified') {
    const targetTimestamp =
      typeof lastModifiedOverride === 'number' &&
      Number.isFinite(lastModifiedOverride)
        ? lastModifiedOverride
        : typeof sourceLastModified === 'number' &&
            Number.isFinite(sourceLastModified)
          ? sourceLastModified
          : derived.kind === 'file'
            ? derived.value
            : undefined;
    if (typeof targetTimestamp !== 'number') {
      warnings.push(
        createWarning({
          code: 'META_MTIME_UNAVAILABLE',
          field: 'Capture Time',
          reason: 'Edited timestamp unavailable',
        }),
      );
      warnings.push(
        createWarning({
          code: 'ORDERING_REQUIREMENT_NOT_MET',
          field: 'Capture Time',
          reason: 'Edited timestamp unavailable',
        }),
      );
      return {
        file,
        status: 'warning',
        warnings,
        warningReason: warnings.map((w) => w.messageJa).join(' / '),
        captureTimeBadge,
      };
    }
    effectiveDerived = {
      kind: 'file',
      value: targetTimestamp,
      offset: formatOffsetString(new Date(targetTimestamp)),
    };
    captureTimeBadge = 'from-mtime';
    fallbackUsed = true;
  } else if (
    timestampWriteMode === 'copyExif' &&
    derived.kind !== 'exif' &&
    derived.kind === 'file'
  ) {
    fallbackUsed = true;
    captureTimeBadge = 'from-mtime';
  } else if (timestampWriteMode === 'copyExif' && derived.kind === 'exif') {
    captureTimeBadge = 'original';
  }

  if (!isExifWritable(file)) {
    warnings.push(
      createWarning({
        code: 'META_UNSUPPORTED_OUTPUT',
        field: 'Capture Time',
        reason: 'Output format does not support Exif metadata',
      }),
    );
    return {
      file,
      status: 'warning',
      warnings,
      warningReason: warnings.map((w) => w.messageJa).join(' / '),
      captureTimeBadge,
    };
  }

  const dateStrings = buildExifDateStrings(effectiveDerived);
  if (!dateStrings) {
    warnings.push(
      createWarning({
        code: 'META_APPLY_FAILED',
        field: 'Capture Time',
        reason: 'Unsupported timestamp format',
      }),
    );
    return {
      file,
      status: 'warning',
      warnings,
      warningReason: warnings.map((w) => w.messageJa).join(' / '),
      captureTimeBadge,
    };
  }

  try {
    const dataUrl = await blobToDataURL(file);
    const stripped = piexif.remove(dataUrl);
    const payload = {
      '0th': {} as Record<number, string>,
      Exif: {} as Record<number, string>,
      '1st': {} as Record<number, string>,
      thumbnail: undefined,
    };

    payload.Exif[EXIF_TAGS.DateTimeOriginal] = dateStrings.primary;
    payload.Exif[EXIF_TAGS.DateTimeDigitized] = dateStrings.secondary;
    payload['0th'][EXIF_TAGS.DateTime] = dateStrings.primary;
    if (dateStrings.offset) {
      payload.Exif[EXIF_TAGS.OffsetTimeOriginal] = dateStrings.offset;
      payload.Exif[EXIF_TAGS.OffsetTimeDigitized] = dateStrings.offset;
      payload['0th'][EXIF_TAGS.OffsetTime] = dateStrings.offset;
    }

    const exifBytes = piexif.dump(payload);
    const injected = piexif.insert(exifBytes, stripped);
    const blob = dataURLToBlob(injected, file.type || JPEG_MIME);
    const fileOptions: FilePropertyBag = {
      type: file.type || JPEG_MIME,
    };

    const normalizedOverrideTimestamp =
      typeof lastModifiedOverride === 'number' &&
      Number.isFinite(lastModifiedOverride)
        ? Math.trunc(lastModifiedOverride)
        : undefined;
    if (typeof normalizedOverrideTimestamp === 'number') {
      fileOptions.lastModified = normalizedOverrideTimestamp;
    } else if (timestampWriteMode !== 'off') {
      const lastModified = resolveLastModifiedFromDerived(effectiveDerived);
      if (typeof lastModified === 'number' && Number.isFinite(lastModified)) {
        fileOptions.lastModified = Math.trunc(lastModified);
      }
    }

    const targetFileName =
      typeof fileNameOverride === 'string' && fileNameOverride.trim().length > 0
        ? fileNameOverride
        : file.name || 'image.jpg';

    workingFile = new File([blob], targetFileName, fileOptions);
  } catch (error) {
    warnings.push(
      createWarning({
        code: 'META_APPLY_FAILED',
        field: 'Capture Time',
        reason: 'Failed to inject Exif timestamp',
      }),
    );
    return {
      file,
      status: 'warning',
      warnings,
      warningReason: warnings.map((w) => w.messageJa).join(' / '),
      captureTimeBadge,
    };
  }

  if (
    typeof lastModifiedOverride === 'number' &&
    Number.isFinite(lastModifiedOverride) &&
    workingFile.lastModified !== Math.trunc(lastModifiedOverride)
  ) {
    workingFile = new File([workingFile], workingFile.name, {
      type: workingFile.type,
      lastModified: Math.trunc(lastModifiedOverride),
    });
  }

  const unsupportedToggles: Array<{
    enabled: boolean;
    field: string;
    code: MetadataWarningCode;
    reason: string;
  }> = [
    {
      enabled: metadataOptions.gpsEnabled,
      field: 'GPS metadata',
      code: 'META_UNSUPPORTED_OUTPUT',
      reason: 'GPS preserve not supported in Phase3 implementation',
    },
    {
      enabled: metadataOptions.preserveXmp,
      field: 'XMP metadata',
      code: 'META_UNSUPPORTED_OUTPUT',
      reason: 'XMP preserve not supported in Phase3 implementation',
    },
    {
      enabled:
        metadataOptions.preserveXmpManagement &&
        metadataOptions.preserveXmp,
      field: 'XMP captions/rights',
      code: 'META_UNSUPPORTED_OUTPUT',
      reason: 'XMP management fields not supported in Phase3 implementation',
    },
  ];

  unsupportedToggles.forEach((toggle) => {
    if (toggle.enabled) {
      warnings.push(
        createWarning({
          code: toggle.code,
          field: toggle.field,
          reason: toggle.reason,
        }),
      );
    }
  });

  const success =
    needsExif && timestampWriteMode !== 'off'
      ? captureTimeBadge !== 'not-applied'
      : true;
  let status = evaluateStatus({
    success,
    ordering,
    fallbackUsed,
  });

  if (warnings.length > 0 && status !== 'warning') {
    status = 'warning';
  }

  let warningReason: string | undefined;
  if (warnings.length > 0) {
    warningReason = warnings.map((w) => w.messageJa).join(' / ');
  } else if (status === 'best-effort') {
    warningReason = fallbackUsed
      ? 'Best-effort: timestamp derived from edited/lastModified metadata.'
      : 'Ordering is enforced via filename sorting; verify in the destination app.';
  }

  return {
    file: workingFile,
    status,
    warnings,
    warningReason,
    captureTimeBadge,
  };
}

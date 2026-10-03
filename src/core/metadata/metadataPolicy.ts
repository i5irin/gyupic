import exifr from 'exifr';
import piexif from 'piexifjs';
import type { DeliveryScenarioId } from '../../domain/deliveryScenarios';
import {
  DELIVERY_SCENARIOS,
  DEFAULT_DELIVERY_SCENARIO_ID,
} from '../../domain/deliveryScenarios';
import type {
  DerivedTimestamp,
  MetadataGuaranteeStatus,
} from '../../state/jobTypes';

const JPEG_MIME = 'image/jpeg';

const EXIF_TAGS = {
  DateTime: 0x0132, // 306
  DateTimeOriginal: 0x9003, // 36867
  DateTimeDigitized: 0x9004, // 36868
  OffsetTime: 0x9010, // 36880
  OffsetTimeOriginal: 0x9011, // 36881
  OffsetTimeDigitized: 0x9012, // 36882
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
  scenarioId?: DeliveryScenarioId;
};

export type ApplyResult = {
  file: File;
  status: MetadataGuaranteeStatus;
  warningReason?: string;
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

function evaluateStatus(
  success: boolean,
  scenarioId: DeliveryScenarioId,
  failureReason?: string,
): { status: MetadataGuaranteeStatus; warningReason?: string } {
  if (!success) {
    return {
      status: 'warning',
      warningReason: failureReason || 'Metadata guarantee unavailable',
    };
  }

  const scenario = DELIVERY_SCENARIOS[scenarioId];
  if (!scenario) {
    return {
      status: 'warning',
      warningReason: 'Unknown delivery scenario',
    };
  }

  if (
    scenario.category === 'experimental' ||
    scenario.guarantee === 'unverified'
  ) {
    return {
      status: 'skipped',
      warningReason: `${scenario.title} is not verified yet`,
    };
  }

  return { status: 'guaranteed' };
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
  scenarioId,
}: ApplyOptions): Promise<ApplyResult> {
  const effectiveScenarioId = scenarioId ?? DEFAULT_DELIVERY_SCENARIO_ID;
  if (!isExifWritable(file)) {
    return {
      file,
      ...evaluateStatus(
        false,
        effectiveScenarioId,
        'File type does not support Exif',
      ),
    };
  }

  if (derived.kind === 'unavailable') {
    return {
      file,
      ...evaluateStatus(false, effectiveScenarioId, 'Timestamp unavailable'),
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

    const dateStrings = buildExifDateStrings(derived);
    if (!dateStrings) {
      return {
        file,
        ...evaluateStatus(
          false,
          effectiveScenarioId,
          'Unsupported timestamp format',
        ),
      };
    }

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
    const nextFile = new File([blob], file.name || 'image.jpg', {
      type: file.type || JPEG_MIME,
    });

    return {
      file: nextFile,
      ...evaluateStatus(true, effectiveScenarioId),
    };
  } catch (error) {
    return {
      file,
      ...evaluateStatus(
        false,
        effectiveScenarioId,
        'Failed to inject Exif timestamp',
      ),
    };
  }
}

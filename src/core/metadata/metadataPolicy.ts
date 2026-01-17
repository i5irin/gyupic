import exifr from 'exifr';
import piexif from 'piexifjs';
import type { MetadataRequirements } from '../../domain/metadataRequirements';
import type {
  DerivedTimestamp,
  MetadataGuaranteeStatus,
} from '../../state/jobTypes';

const JPEG_MIME = 'image/jpeg';
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_EXIF_TYPE = new Uint8Array([101, 88, 73, 102]); // eXIf
const PNG_IEND_TYPE = new Uint8Array([73, 69, 78, 68]); // IEND

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

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let j = 0; j < 8; j += 1) {
      // eslint-disable-next-line no-bitwise
      if ((crc & 1) !== 0) {
        // eslint-disable-next-line no-bitwise
        crc = 0xedb88320 ^ (crc >>> 1);
      } else {
        // eslint-disable-next-line no-bitwise
        crc >>>= 1;
      }
    }
    // eslint-disable-next-line no-bitwise
    table[i] = crc >>> 0;
  }
  return table;
})();

function matchesFileType(file: File, keyword: string): boolean {
  const typeMatch = file.type
    ? file.type.toLowerCase().includes(keyword)
    : false;
  const nameMatch = file.name
    ? file.name.toLowerCase().includes(keyword)
    : false;
  return typeMatch || nameMatch;
}

function hasExtension(file: File, extension: string): boolean {
  return file.name?.toLowerCase().endsWith(extension) ?? false;
}

function isPngFile(file: File): boolean {
  return matchesFileType(file, 'png') || hasExtension(file, '.png');
}

function isWebpFile(file: File): boolean {
  return matchesFileType(file, 'webp') || hasExtension(file, '.webp');
}

function stringToUint8Array(value: string): Uint8Array {
  const buffer = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    buffer[i] = value.charCodeAt(i) & 0xff;
  }
  return buffer;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    const index = (crc ^ bytes[i]!) & 0xff;
    // eslint-disable-next-line no-bitwise
    crc = CRC32_TABLE[index]! ^ (crc >>> 8);
  }
  // eslint-disable-next-line no-bitwise
  return (crc ^ 0xffffffff) >>> 0;
}

function buildPngChunk(type: Uint8Array, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(data.length + 12);
  const view = new DataView(chunk.buffer);
  // eslint-disable-next-line no-bitwise
  view.setUint32(0, data.length >>> 0);
  chunk.set(type, 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(type.length + data.length);
  crcInput.set(type, 0);
  crcInput.set(data, type.length);
  view.setUint32(chunk.length - 4, crc32(crcInput));
  return chunk;
}

function chunkTypeEquals(chunk: Uint8Array, type: Uint8Array): boolean {
  if (chunk.length < 12) {
    return false;
  }
  for (let i = 0; i < 4; i += 1) {
    if (chunk[4 + i] !== type[i]) {
      return false;
    }
  }
  return true;
}

async function rewritePngCaptureTimeFallback(
  file: File,
  payload: Uint8Array,
): Promise<Uint8Array> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  if (buffer.length < PNG_SIGNATURE.length) {
    throw new Error('PNG signature missing.');
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (buffer[i] !== PNG_SIGNATURE[i]) {
      throw new Error('File is not a PNG image.');
    }
  }

  const chunks: Uint8Array[] = [];
  let cursor = PNG_SIGNATURE.length;
  let inserted = false;
  let sawIhdr = false;
  const exifChunk = buildPngChunk(PNG_EXIF_TYPE, payload);

  while (cursor + 8 <= buffer.length) {
    const length = view.getUint32(cursor, false);
    const chunkEnd = cursor + 8 + length + 4;
    if (chunkEnd > buffer.length) {
      throw new Error('PNG chunk exceeds buffer length.');
    }
    const chunkType = buffer.slice(cursor + 4, cursor + 8);
    const typeString = String.fromCharCode(
      chunkType[0]!,
      chunkType[1]!,
      chunkType[2]!,
      chunkType[3]!,
    );
    if (typeString === 'eXIf') {
      cursor = chunkEnd;
      // eslint-disable-next-line no-continue
      continue;
    }
    const chunkBytes = buffer.slice(cursor, chunkEnd);
    chunks.push(chunkBytes);
    if (typeString === 'IHDR') {
      sawIhdr = true;
      chunks.push(exifChunk.slice());
      inserted = true;
    }
    cursor = chunkEnd;
    if (typeString === 'IEND') {
      break;
    }
  }

  if (!sawIhdr) {
    throw new Error('PNG image is missing an IHDR chunk.');
  }
  if (!inserted) {
    const position = chunks.findIndex((chunk) =>
      chunkTypeEquals(chunk, PNG_IEND_TYPE),
    );
    if (position === -1) {
      throw new Error('PNG image is missing an IEND chunk.');
    }
    chunks.splice(position, 0, exifChunk.slice());
  }

  const totalLength =
    PNG_SIGNATURE.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  output.set(PNG_SIGNATURE, offset);
  offset += PNG_SIGNATURE.length;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

type DeriveOptions = {
  file: File;
};

type ApplyOptions = {
  file: File;
  derived: DerivedTimestamp;
  requirements: MetadataRequirements;
  fileNameOverride?: string;
  lastModifiedOverride?: number;
};

export type ApplyResult = {
  file: File;
  status: MetadataGuaranteeStatus;
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

function buildExifPayloadBinary(
  derived: DerivedTimestamp,
): { exifBytes: string } | null {
  const dateStrings = buildExifDateStrings(derived);
  if (!dateStrings) {
    return null;
  }
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
  return { exifBytes: piexif.dump(payload) };
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
  requirements: MetadataRequirements;
  fallbackUsed?: boolean;
}): { status: MetadataGuaranteeStatus } {
  const { success, requirements, fallbackUsed } = options;
  if (!requirements.captureTime.enabled) {
    return { status: 'skipped' };
  }
  if (!success) {
    return { status: 'warning' };
  }
  if (fallbackUsed) {
    return { status: 'best-effort' };
  }
  return { status: 'guaranteed' };
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
  requirements,
  fileNameOverride,
  lastModifiedOverride,
}: ApplyOptions): Promise<ApplyResult> {
  const timestampWriteMode = requirements.captureTime.mode;
  const needsExif = requirements.captureTime.enabled;
  const allowFallback = timestampWriteMode === 'from-file-modified';
  const derivedHasTime = derived.kind !== 'unavailable';
  const derivedIsExif = derived.kind === 'exif';
  const fallbackUsed =
    needsExif && !derivedIsExif && derived.kind === 'file' && allowFallback;

  if (needsExif && !derivedHasTime && !allowFallback) {
    return {
      file,
      ...evaluateStatus({
        success: false,
        requirements,
      }),
    };
  }

  let workingFile = file;
  const normalizedOverrideTimestamp =
    typeof lastModifiedOverride === 'number' &&
    Number.isFinite(lastModifiedOverride)
      ? Math.trunc(lastModifiedOverride)
      : undefined;
  const derivedLastModified =
    timestampWriteMode !== 'off'
      ? resolveLastModifiedFromDerived(derived)
      : null;
  const inferredLastModified =
    typeof derivedLastModified === 'number' &&
    Number.isFinite(derivedLastModified)
      ? Math.trunc(derivedLastModified)
      : undefined;
  const nextLastModified =
    typeof normalizedOverrideTimestamp === 'number'
      ? normalizedOverrideTimestamp
      : inferredLastModified;
  const fallbackName =
    file.name ||
    // eslint-disable-next-line no-nested-ternary
    (isPngFile(file)
      ? 'image.png'
      : isWebpFile(file)
      ? 'image.webp'
      : 'image.jpg');
  const targetFileName =
    typeof fileNameOverride === 'string' && fileNameOverride.trim().length > 0
      ? fileNameOverride
      : fallbackName;

  if (needsExif && derivedHasTime) {
    const payload = buildExifPayloadBinary(derived);
    if (!payload) {
      return {
        file,
        ...evaluateStatus({
          success: false,
          requirements,
        }),
      };
    }

    if (isExifWritable(file)) {
      try {
        const dataUrl = await blobToDataURL(file);
        const stripped = piexif.remove(dataUrl);
        const injected = piexif.insert(payload.exifBytes, stripped);
        const blob = dataURLToBlob(injected, file.type || JPEG_MIME);
        const fileOptions: FilePropertyBag = {
          type: file.type || JPEG_MIME,
        };
        if (typeof nextLastModified === 'number') {
          fileOptions.lastModified = nextLastModified;
        }
        workingFile = new File([blob], targetFileName, fileOptions);
      } catch {
        return {
          file,
          ...evaluateStatus({
            success: false,
            requirements,
          }),
        };
      }
    } else if (isPngFile(file)) {
      try {
        const rewritten = await rewritePngCaptureTimeFallback(
          file,
          stringToUint8Array(payload.exifBytes),
        );
        const fileOptions: FilePropertyBag = {
          type: file.type || 'image/png',
        };
        if (typeof nextLastModified === 'number') {
          fileOptions.lastModified = nextLastModified;
        }
        const normalizedBytes = new Uint8Array(rewritten);
        workingFile = new File([normalizedBytes], targetFileName, fileOptions);
      } catch {
        return {
          file,
          ...evaluateStatus({
            success: false,
            requirements,
          }),
        };
      }
    } else if (isWebpFile(file)) {
      return {
        file,
        ...evaluateStatus({
          success: false,
          requirements,
        }),
      };
    } else if (needsExif && !fallbackUsed) {
      return {
        file,
        ...evaluateStatus({
          success: false,
          requirements,
        }),
      };
    }
  } else if (!isExifWritable(file) && needsExif && !fallbackUsed) {
    return {
      file,
      ...evaluateStatus({
        success: false,
        requirements,
      }),
    };
  }

  if (
    typeof normalizedOverrideTimestamp === 'number' &&
    workingFile.lastModified !== normalizedOverrideTimestamp
  ) {
    workingFile = new File([workingFile], workingFile.name, {
      type: workingFile.type,
      lastModified: normalizedOverrideTimestamp,
    });
  }

  const success = needsExif ? derivedIsExif || fallbackUsed : true;
  return {
    file: workingFile,
    ...evaluateStatus({
      success,
      requirements,
      fallbackUsed,
    }),
  };
}

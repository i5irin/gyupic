import ImageFileService from '../../services/image-file-service';
import type {
  FilenameStrategy,
  OrderingRequirement,
  OutputFormat,
  PresetId,
  TimestampWriteMode,
} from '../../domain/presets';
import type { DerivedTimestamp, JobMetadataInfo } from '../../state/jobTypes';
import {
  applyMetadataWithMetadataCore,
  deriveTimestampWithMetadataCore,
  planFilenameWithMetadataCore,
  type MetadataCoreDeriveSession,
} from '../metadata/metadataCoreAdapter';
import { parseExifDateTime } from '../metadata/metadataPolicy';
import {
  canUseOffscreenConversion,
  convertWithOffscreenCanvas,
} from '../conversion/offscreenCanvasConverter';
import { OUTPUT_FORMAT_CONFIG } from '../../shared/outputFormatConfig';
import { asProcessingPipelineError } from './processingErrors';

export type ProcessingPipelineParams = {
  sourceFile: File;
  jpegQuality: number;
  outputFormat: OutputFormat;
  filenameStrategy: FilenameStrategy;
  timestampWriteMode: TimestampWriteMode;
  rewriteExif: boolean;
  injectFromEditedTime: boolean;
  presetId: PresetId;
  ordering: OrderingRequirement;
};

export type ProcessingPipelineResult = {
  file: File;
  sizeBefore: number;
  sizeAfter: number;
  reductionRatio: number;
  metadata: JobMetadataInfo;
  warningReason?: string;
  filenameWarning?: string;
  expectedFileName?: string;
};

async function convertSourceToFormat(
  file: File,
  quality: number,
  format: OutputFormat,
): Promise<File> {
  if (canUseOffscreenConversion()) {
    try {
      return await convertWithOffscreenCanvas(file, { format, quality });
    } catch (error) {
      throw asProcessingPipelineError(
        error,
        'convert_failed',
        'Failed to convert image via OffscreenCanvas',
      );
    }
  }
  let imageFile: Awaited<ReturnType<typeof ImageFileService.load>>;
  try {
    imageFile = await ImageFileService.load(file);
  } catch (error) {
    throw asProcessingPipelineError(
      error,
      'load_source_failed',
      'Failed to load image file',
    );
  }
  try {
    return await ImageFileService.convertToFormat(imageFile, format, quality);
  } catch (error) {
    throw asProcessingPipelineError(
      error,
      'convert_failed',
      'Failed to convert image to target format',
    );
  }
}

function getBaseName(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return fileName;
  }
  return fileName.slice(0, lastDotIndex);
}

function sanitizeBaseName(raw: string): string {
  const normalized = raw.normalize('NFKC');
  const sanitized = normalized
    .replace(/[^\p{L}\p{N}\-_.]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return sanitized.length > 0 ? sanitized.slice(0, 120) : 'image';
}

function formatTimestampForFilename(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate(),
  )}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

type FilenamePlan = {
  targetName?: string;
  timestampMs?: number;
  warning?: string;
};

function resolveTimestampMs(
  derived: DerivedTimestamp,
  sourceFile: File,
  mode: TimestampWriteMode,
): number | undefined {
  if (mode === 'from-file-modified') {
    if (
      Number.isFinite(sourceFile.lastModified) &&
      sourceFile.lastModified > 0
    ) {
      return sourceFile.lastModified;
    }
    if (derived.kind === 'file') {
      return derived.value;
    }
  }
  if (mode === 'copy-exif' || mode === 'off') {
    if (derived.kind === 'exif') {
      const parsed = parseExifDateTime(derived.value, derived.offset);
      if (parsed !== null) {
        return parsed;
      }
    }
    if (derived.kind === 'file') {
      return derived.value;
    }
    if (
      mode === 'off' &&
      Number.isFinite(sourceFile.lastModified) &&
      sourceFile.lastModified > 0
    ) {
      return sourceFile.lastModified;
    }
  }
  return undefined;
}

function buildLegacyFilenamePlan(options: {
  filenameStrategy: FilenameStrategy;
  timestampWriteMode: TimestampWriteMode;
  derived: DerivedTimestamp;
  sourceFile: File;
  outputFormat: OutputFormat;
}): FilenamePlan {
  const {
    filenameStrategy,
    timestampWriteMode,
    derived,
    sourceFile,
    outputFormat,
  } = options;
  if (filenameStrategy === 'keep-original') {
    return {};
  }
  const timestampMs = resolveTimestampMs(
    derived,
    sourceFile,
    timestampWriteMode,
  );
  if (!timestampMs) {
    return {
      warning: 'Rename skipped: Timestamp unavailable.',
    };
  }
  const date = new Date(timestampMs);
  const timestamp = formatTimestampForFilename(date);
  const baseName = sanitizeBaseName(getBaseName(sourceFile.name || ''));
  const config = OUTPUT_FORMAT_CONFIG[outputFormat];
  return {
    targetName: `${timestamp}_${baseName}${config.extension}`,
    timestampMs,
  };
}

async function planOutputFilename(options: {
  filenameStrategy: FilenameStrategy;
  timestampWriteMode: TimestampWriteMode;
  derived: DerivedTimestamp;
  sourceFile: File;
  outputFormat: OutputFormat;
  session: MetadataCoreDeriveSession;
}): Promise<FilenamePlan> {
  const {
    filenameStrategy,
    timestampWriteMode,
    derived,
    sourceFile,
    outputFormat,
    session,
  } = options;
  if (filenameStrategy === 'keep-original') {
    return {};
  }
  if (session.mode === 'wasm') {
    try {
      const planResult = await planFilenameWithMetadataCore({
        sourceFile,
        filenameStrategy,
        outputFormat,
        session,
      });
      return {
        targetName: planResult.targetName ?? undefined,
        timestampMs:
          typeof planResult.timestampMs === 'number' &&
          Number.isFinite(planResult.timestampMs)
            ? planResult.timestampMs
            : undefined,
        warning:
          Array.isArray(planResult.warnings) && planResult.warnings.length > 0
            ? planResult.warnings.map((warning) => warning.message).join(' / ')
            : undefined,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        'metadata-core: filename planning via WASM failed, falling back',
        error,
      );
    }
  }
  return buildLegacyFilenamePlan({
    filenameStrategy,
    timestampWriteMode,
    derived,
    sourceFile,
    outputFormat,
  });
}

export async function runProcessingPipeline(
  params: ProcessingPipelineParams,
): Promise<ProcessingPipelineResult> {
  const {
    sourceFile,
    jpegQuality,
    outputFormat,
    filenameStrategy,
    timestampWriteMode,
    rewriteExif,
    injectFromEditedTime,
    presetId,
    ordering,
  } = params;
  const convertedFile = await convertSourceToFormat(
    sourceFile,
    jpegQuality,
    outputFormat,
  );

  const captureTimeEnabled =
    timestampWriteMode !== 'off' || filenameStrategy === 'timestamped';

  let deriveSession: Awaited<
    ReturnType<typeof deriveTimestampWithMetadataCore>
  >;
  try {
    deriveSession = await deriveTimestampWithMetadataCore({
      file: sourceFile,
      captureTimeEnabled,
      timestampWriteMode,
    });
  } catch (error) {
    throw asProcessingPipelineError(
      error,
      'metadata_derive_failed',
      'Failed to derive metadata from source file',
    );
  }
  const derivedTimestamp = deriveSession.derived;

  const filenamePlan = await planOutputFilename({
    filenameStrategy,
    timestampWriteMode,
    derived: derivedTimestamp,
    sourceFile,
    outputFormat,
    session: deriveSession,
  });

  const applyResult = await applyMetadataWithMetadataCore({
    file: convertedFile,
    session: deriveSession,
    ordering,
    timestampWriteMode,
    rewriteExif,
    injectFromEditedTime,
    outputFormat,
    fileNameOverride: filenamePlan.targetName,
    lastModifiedOverrideMs: filenamePlan.timestampMs,
  });

  let finalFile = applyResult.file;
  if (filenamePlan.targetName && finalFile.name !== filenamePlan.targetName) {
    const fileOptions: FilePropertyBag = {
      type: finalFile.type,
    };
    if (
      typeof filenamePlan.timestampMs === 'number' &&
      Number.isFinite(filenamePlan.timestampMs)
    ) {
      fileOptions.lastModified = Math.trunc(filenamePlan.timestampMs);
    } else if (Number.isFinite(finalFile.lastModified)) {
      fileOptions.lastModified = finalFile.lastModified;
    }
    finalFile = new File([finalFile], filenamePlan.targetName, fileOptions);
  }

  const sizeBefore = sourceFile.size;
  const sizeAfter = finalFile.size;
  const reductionRatio =
    sizeBefore > 0 ? Math.max(0, (sizeBefore - sizeAfter) / sizeBefore) : 0;

  const metadata: JobMetadataInfo = {
    presetId,
    ordering,
    derived: derivedTimestamp,
    status: applyResult.status,
    reason: applyResult.warningReason,
  };

  return {
    file: finalFile,
    sizeBefore,
    sizeAfter,
    reductionRatio,
    metadata,
    warningReason: applyResult.warningReason,
    filenameWarning: filenamePlan.warning,
    expectedFileName: finalFile.name,
  };
}

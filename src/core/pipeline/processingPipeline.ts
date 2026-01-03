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
  applyTimestamp,
  deriveTimestamp,
  parseExifDateTime,
} from '../metadata/metadataPolicy';
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

function buildFilenamePlan(options: {
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

  let derivedTimestamp: Awaited<ReturnType<typeof deriveTimestamp>>;
  try {
    derivedTimestamp = await deriveTimestamp({
      file: sourceFile,
    });
  } catch (error) {
    throw asProcessingPipelineError(
      error,
      'metadata_derive_failed',
      'Failed to derive metadata from source file',
    );
  }

  const filenamePlan = buildFilenamePlan({
    filenameStrategy,
    timestampWriteMode,
    derived: derivedTimestamp,
    sourceFile,
    outputFormat,
  });

  let applyResult: Awaited<ReturnType<typeof applyTimestamp>>;
  try {
    applyResult = await applyTimestamp({
      file: convertedFile,
      derived: derivedTimestamp,
      ordering,
      timestampWriteMode,
      rewriteExif,
      injectFromEditedTime,
      fileNameOverride: filenamePlan.targetName,
      lastModifiedOverride: filenamePlan.timestampMs,
    });
  } catch (error) {
    throw asProcessingPipelineError(
      error,
      'metadata_apply_failed',
      'Failed to apply metadata to converted file',
    );
  }

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

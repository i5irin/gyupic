import ImageFileService from '../../services/image-file-service';
import type { DeliveryId } from '../../domain/deliveryCatalog';
import type { PickupId } from '../../domain/pickupCatalog';
import type {
  FilenameSource,
  MetadataPolicyMode,
  OutputFormat,
  PresetId,
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
  filenameSource: FilenameSource;
  pickupId: PickupId;
  deliveryId: DeliveryId;
  presetId: PresetId;
  metadataPolicyMode: MetadataPolicyMode;
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

function resolveTimestampForFilename(
  filenameSource: FilenameSource,
  derived: DerivedTimestamp,
  sourceFile: File,
): { timestampMs?: number; warning?: string } {
  if (filenameSource === 'original') {
    return {};
  }
  if (filenameSource === 'exif') {
    if (derived.kind !== 'exif') {
      return {
        warning: 'Rename skipped: Exif timestamp unavailable.',
      };
    }
    const parsed = parseExifDateTime(derived.value, derived.offset);
    if (parsed === null) {
      return {
        warning: 'Rename skipped: Failed to parse Exif timestamp.',
      };
    }
    return { timestampMs: parsed };
  }
  if (filenameSource === 'file-last-modified') {
    if (
      derived.kind === 'file' &&
      typeof derived.value === 'number' &&
      Number.isFinite(derived.value)
    ) {
      return { timestampMs: derived.value };
    }
    if (
      Number.isFinite(sourceFile.lastModified) &&
      sourceFile.lastModified > 0
    ) {
      return { timestampMs: sourceFile.lastModified };
    }
    return {
      warning: 'Rename skipped: File modified timestamp unavailable.',
    };
  }
  return { warning: 'Rename skipped: Unsupported timestamp source.' };
}

function buildFilenamePlan(options: {
  filenameSource: FilenameSource;
  derived: DerivedTimestamp;
  sourceFile: File;
  outputFormat: OutputFormat;
}): FilenamePlan {
  const { filenameSource, derived, sourceFile, outputFormat } = options;
  if (filenameSource === 'original') {
    return {};
  }
  const timestampInfo = resolveTimestampForFilename(
    filenameSource,
    derived,
    sourceFile,
  );
  if (!timestampInfo.timestampMs) {
    return {
      warning: timestampInfo.warning,
    };
  }
  const date = new Date(timestampInfo.timestampMs);
  const timestamp = formatTimestampForFilename(date);
  const baseName = sanitizeBaseName(getBaseName(sourceFile.name || ''));
  const config = OUTPUT_FORMAT_CONFIG[outputFormat];
  return {
    targetName: `${timestamp}_${baseName}${config.extension}`,
    timestampMs: timestampInfo.timestampMs,
  };
}

export async function runProcessingPipeline(
  params: ProcessingPipelineParams,
): Promise<ProcessingPipelineResult> {
  const {
    sourceFile,
    jpegQuality,
    outputFormat,
    filenameSource,
    pickupId,
    deliveryId,
    presetId,
    metadataPolicyMode,
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
    filenameSource,
    derived: derivedTimestamp,
    sourceFile,
    outputFormat,
  });

  let applyResult: Awaited<ReturnType<typeof applyTimestamp>>;
  try {
    applyResult = await applyTimestamp({
      file: convertedFile,
      derived: derivedTimestamp,
      deliveryId,
      metadataPolicyMode,
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

  return {
    file: finalFile,
    sizeBefore,
    sizeAfter,
    reductionRatio,
    metadata: {
      presetId,
      pickupId,
      deliveryId,
      metadataPolicyMode,
      derived: derivedTimestamp,
      status: applyResult.status,
      reason: applyResult.warningReason,
    },
    warningReason: applyResult.warningReason,
    filenameWarning: filenamePlan.warning,
    expectedFileName: finalFile.name,
  };
}

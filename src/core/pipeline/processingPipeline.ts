import ImageFileService from '../../services/image-file-service';
import type {
  FilenameStrategy,
  FilenameTimestampSource,
  OutputFormat,
  PresetId,
  TimestampWriteMode,
} from '../../domain/presets';
import {
  buildMetadataRequirements,
  shouldDeriveCaptureTime,
} from '../../domain/metadataRequirements';
import type {
  DerivedTimestamp,
  JobMetadataInfo,
  MetadataWarning,
} from '../../state/jobTypes';
import {
  applyMetadataWithMetadataCore,
  deriveTimestampWithMetadataCore,
  planFilenameWithMetadataCore,
  type MetadataCoreDeriveSession,
} from '../metadata/metadataCoreAdapter';
import { parseExifDateTime } from '../metadata/metadataPolicy';
import { buildMetadataWarningMessage } from '../metadata/wasmBridge';
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
  filenameTimestampSource: FilenameTimestampSource;
  timestampWriteMode: TimestampWriteMode;
  presetId: PresetId;
};

export type ProcessingPipelineResult = {
  file: File;
  sizeBefore: number;
  sizeAfter: number;
  reductionRatio: number;
  metadata: JobMetadataInfo;
  warnings: MetadataWarning[];
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
  warnings: MetadataWarning[];
};

function resolveLegacyTimestampMs(options: {
  filenameTimestampSource: FilenameTimestampSource;
  derived: DerivedTimestamp;
  sourceFile: File;
}): number | undefined {
  const { filenameTimestampSource, derived, sourceFile } = options;
  if (filenameTimestampSource === 'captureTime') {
    if (derived.kind === 'exif') {
      return parseExifDateTime(derived.value, derived.offset) ?? undefined;
    }
    return undefined;
  }
  if (Number.isFinite(sourceFile.lastModified) && sourceFile.lastModified > 0) {
    return sourceFile.lastModified;
  }
  if (derived.kind === 'file') {
    return derived.value;
  }
  return undefined;
}

function buildLegacyFilenamePlan(options: {
  filenameStrategy: FilenameStrategy;
  filenameTimestampSource: FilenameTimestampSource;
  derived: DerivedTimestamp;
  sourceFile: File;
  outputFormat: OutputFormat;
}): FilenamePlan {
  const {
    filenameStrategy,
    filenameTimestampSource,
    derived,
    sourceFile,
    outputFormat,
  } = options;
  if (filenameStrategy === 'keep-original') {
    return { warnings: [] };
  }
  const timestampMs = resolveLegacyTimestampMs({
    filenameTimestampSource,
    derived,
    sourceFile,
  });
  if (!timestampMs) {
    return {
      warnings: [
        {
          code: 'META_MISSING_INPUT',
          field: 'OUTPUT_FILENAME',
          reason: 'missing in input',
          message: buildMetadataWarningMessage(
            'OUTPUT_FILENAME',
            'missing in input',
          ),
        },
      ],
    };
  }
  const date = new Date(timestampMs);
  const timestamp = formatTimestampForFilename(date);
  const baseName = sanitizeBaseName(getBaseName(sourceFile.name || ''));
  const config = OUTPUT_FORMAT_CONFIG[outputFormat];
  return {
    targetName: `${timestamp}_${baseName}${config.extension}`,
    timestampMs,
    warnings: [],
  };
}

async function planOutputFilename(options: {
  filenameStrategy: FilenameStrategy;
  filenameTimestampSource: FilenameTimestampSource;
  derived: DerivedTimestamp;
  sourceFile: File;
  outputFormat: OutputFormat;
  session: MetadataCoreDeriveSession;
}): Promise<FilenamePlan> {
  const {
    filenameStrategy,
    filenameTimestampSource,
    derived,
    sourceFile,
    outputFormat,
    session,
  } = options;
  if (filenameStrategy === 'keep-original') {
    return { warnings: [] };
  }
  if (session.mode === 'wasm') {
    try {
      const planResult = await planFilenameWithMetadataCore({
        sourceFile,
        filenameStrategy,
        filenameTimestampSource,
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
        warnings: planResult.warnings ?? [],
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
    filenameTimestampSource,
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
    filenameTimestampSource,
    timestampWriteMode,
    presetId,
  } = params;
  const metadataRequirements = buildMetadataRequirements({
    filenameStrategy,
    filenameTimestampSource,
    timestampWriteMode,
  });
  const convertedFile = await convertSourceToFormat(
    sourceFile,
    jpegQuality,
    outputFormat,
  );

  const captureTimeEnabled = shouldDeriveCaptureTime(metadataRequirements);

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
    filenameTimestampSource,
    derived: derivedTimestamp,
    sourceFile,
    outputFormat,
    session: deriveSession,
  });

  const applyResult = await applyMetadataWithMetadataCore({
    file: convertedFile,
    session: deriveSession,
    requirements: metadataRequirements,
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
    derived: derivedTimestamp,
    status: applyResult.status,
    reason: applyResult.warnings[0]?.message,
    captureTimeBadge: applyResult.captureTimeBadge,
  };
  const warnings = [...applyResult.warnings, ...filenamePlan.warnings];

  return {
    file: finalFile,
    sizeBefore,
    sizeAfter,
    reductionRatio,
    metadata,
    warnings,
    expectedFileName: finalFile.name,
  };
}

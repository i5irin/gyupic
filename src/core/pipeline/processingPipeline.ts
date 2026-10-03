import ImageFileService from '../../services/image-file-service';
import type { DeliveryId } from '../../domain/deliveryCatalog';
import type { PickupId } from '../../domain/pickupCatalog';
import type { MetadataPolicyMode, PresetId } from '../../domain/presets';
import type { JobMetadataInfo } from '../../state/jobTypes';
import { applyTimestamp, deriveTimestamp } from '../metadata/metadataPolicy';
import {
  canUseOffscreenConversion,
  convertWithOffscreenCanvas,
} from '../conversion/offscreenCanvasConverter';
import { asProcessingPipelineError } from './processingErrors';

export type ProcessingPipelineParams = {
  sourceFile: File;
  jpegQuality: number;
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
};

async function convertSourceToJpeg(file: File, quality: number): Promise<File> {
  if (canUseOffscreenConversion()) {
    try {
      return await convertWithOffscreenCanvas(file, quality);
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
    const converted = await ImageFileService.convertToJpeg(imageFile, quality);
    return converted.asFile();
  } catch (error) {
    throw asProcessingPipelineError(
      error,
      'convert_failed',
      'Failed to convert image to JPEG',
    );
  }
}

export async function runProcessingPipeline(
  params: ProcessingPipelineParams,
): Promise<ProcessingPipelineResult> {
  const {
    sourceFile,
    jpegQuality,
    pickupId,
    deliveryId,
    presetId,
    metadataPolicyMode,
  } = params;
  const convertedFile = await convertSourceToJpeg(sourceFile, jpegQuality);

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

  let applyResult: Awaited<ReturnType<typeof applyTimestamp>>;
  try {
    applyResult = await applyTimestamp({
      file: convertedFile,
      derived: derivedTimestamp,
      deliveryId,
      metadataPolicyMode,
    });
  } catch (error) {
    throw asProcessingPipelineError(
      error,
      'metadata_apply_failed',
      'Failed to apply metadata to converted file',
    );
  }

  const outFile = applyResult.file;
  const sizeBefore = sourceFile.size;
  const sizeAfter = outFile.size;
  const reductionRatio =
    sizeBefore > 0 ? Math.max(0, (sizeBefore - sizeAfter) / sizeBefore) : 0;

  return {
    file: outFile,
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
  };
}

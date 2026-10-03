import ImageFileService from '../../services/image-file-service';
import type { DeliveryId } from '../../domain/deliveryCatalog';
import type { PickupId } from '../../domain/pickupCatalog';
import type { MetadataPolicyMode, PresetId } from '../../domain/presets';
import type { JobMetadataInfo } from '../../state/jobTypes';
import { applyTimestamp, deriveTimestamp } from '../metadata/metadataPolicy';
import { createPerfRecorder, runPerfSpan } from '../../utils/perfTrace';
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

async function convertSourceToJpeg(
  file: File,
  quality: number,
  recorder: ReturnType<typeof createPerfRecorder> | null,
): Promise<File> {
  if (canUseOffscreenConversion()) {
    try {
      return await runPerfSpan(recorder, 'convertWithOffscreenCanvas', () =>
        convertWithOffscreenCanvas(file, quality),
      );
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
    imageFile = await runPerfSpan(recorder, 'loadSourceImage', () =>
      ImageFileService.load(file),
    );
  } catch (error) {
    throw asProcessingPipelineError(
      error,
      'load_source_failed',
      'Failed to load image file',
    );
  }
  try {
    const converted = await runPerfSpan(recorder, 'convertToJpeg', () =>
      ImageFileService.convertToJpeg(imageFile, quality),
    );
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
  const recorder = createPerfRecorder({
    scenario: 'processing-pipeline',
    pickupId,
    deliveryId,
    presetId,
  });

  let extraInfo: Record<string, unknown> | undefined;
  try {
    const convertedFile = await convertSourceToJpeg(
      sourceFile,
      jpegQuality,
      recorder,
    );

    const derivedTimestamp = await runPerfSpan(
      recorder,
      'deriveTimestamp',
      () =>
        deriveTimestamp({
          file: sourceFile,
        }),
    ).catch((error) => {
      throw asProcessingPipelineError(
        error,
        'metadata_derive_failed',
        'Failed to derive metadata from source file',
      );
    });

    const applyResult = await runPerfSpan(recorder, 'applyTimestamp', () =>
      applyTimestamp({
        file: convertedFile,
        derived: derivedTimestamp,
        deliveryId,
        metadataPolicyMode,
      }),
    ).catch((error) => {
      throw asProcessingPipelineError(
        error,
        'metadata_apply_failed',
        'Failed to apply metadata to converted file',
      );
    });

    const outFile = applyResult.file;
    const sizeBefore = sourceFile.size;
    const sizeAfter = outFile.size;
    const reductionRatio =
      sizeBefore > 0 ? Math.max(0, (sizeBefore - sizeAfter) / sizeBefore) : 0;

    extraInfo = {
      sizeBefore,
      sizeAfter,
      reductionRatio,
    };

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
  } finally {
    recorder?.commit(extraInfo);
  }
}

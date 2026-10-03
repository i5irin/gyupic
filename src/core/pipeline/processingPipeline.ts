import ImageFileService from '../../services/image-file-service';
import type { DeliveryId } from '../../domain/deliveryCatalog';
import type { PickupId } from '../../domain/pickupCatalog';
import type { MetadataPolicyMode, PresetId } from '../../domain/presets';
import type { JobMetadataInfo } from '../../state/jobTypes';
import { applyTimestamp, deriveTimestamp } from '../metadata/metadataPolicy';
import { createPerfRecorder, runPerfSpan } from '../../utils/perfTrace';

export type ProcessingPipelineParams = {
  sourceFile: File;
  preparedFile?: File;
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

export async function runProcessingPipeline(
  params: ProcessingPipelineParams,
): Promise<ProcessingPipelineResult> {
  const {
    sourceFile,
    preparedFile,
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
    let convertedFile: File;
    if (preparedFile) {
      convertedFile = preparedFile;
    } else {
      const imageFile = await runPerfSpan(recorder, 'loadSourceImage', () =>
        ImageFileService.load(sourceFile),
      );
      const converted = await runPerfSpan(recorder, 'convertToJpeg', () =>
        ImageFileService.convertToJpeg(imageFile, jpegQuality),
      );
      convertedFile = converted.asFile();
    }

    const derivedTimestamp = await runPerfSpan(
      recorder,
      'deriveTimestamp',
      () =>
        deriveTimestamp({
          file: sourceFile,
        }),
    );

    const applyResult = await runPerfSpan(recorder, 'applyTimestamp', () =>
      applyTimestamp({
        file: convertedFile,
        derived: derivedTimestamp,
        deliveryId,
        metadataPolicyMode,
      }),
    );

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

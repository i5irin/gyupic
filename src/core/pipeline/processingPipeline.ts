import ImageFile from '../../models/image-file';
import ImageFileService from '../../services/image-file-service';
import type { DeliveryId } from '../../domain/deliveryCatalog';
import type { PickupId } from '../../domain/pickupCatalog';
import type { JobMetadataInfo } from '../../state/jobTypes';
import { applyTimestamp, deriveTimestamp } from '../metadata/metadataPolicy';

export type ProcessingPipelineParams = {
  sourceFile: File;
  sourceImage: ImageFile;
  jpegQuality: number;
  pickupId: PickupId;
  deliveryId: DeliveryId;
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
  const { sourceFile, sourceImage, jpegQuality, pickupId, deliveryId } = params;
  const derivedTimestamp = await deriveTimestamp({
    file: sourceFile,
  });

  const converted = await ImageFileService.convertToJpeg(
    sourceImage,
    jpegQuality,
  );

  const applyResult = await applyTimestamp({
    file: converted.asFile(),
    derived: derivedTimestamp,
    deliveryId,
  });

  const outFile = applyResult.file;
  const sizeBefore = sourceFile.size;
  const sizeAfter = outFile.size;
  const reductionRatio =
    sizeBefore > 0
      ? Math.max(0, (sizeBefore - sizeAfter) / sizeBefore)
      : 0;

  return {
    file: outFile,
    sizeBefore,
    sizeAfter,
    reductionRatio,
    metadata: {
      pickupId,
      deliveryId,
      derived: derivedTimestamp,
      status: applyResult.status,
      reason: applyResult.warningReason,
    },
    warningReason: applyResult.warningReason,
  };
}

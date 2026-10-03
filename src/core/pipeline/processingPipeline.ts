import ImageFile from '../../models/image-file';
import ImageFileService from '../../services/image-file-service';
import type { DeliveryScenarioId } from '../../domain/deliveryScenarios';
import type { JobMetadataInfo } from '../../state/jobTypes';
import { applyTimestamp, deriveTimestamp } from '../metadata/metadataPolicy';

export type ProcessingPipelineParams = {
  sourceFile: File;
  sourceImage: ImageFile;
  jpegQuality: number;
  scenarioId: DeliveryScenarioId;
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
  const { sourceFile, sourceImage, jpegQuality, scenarioId } = params;
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
    scenarioId,
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
      scenarioId,
      derived: derivedTimestamp,
      status: applyResult.status,
      reason: applyResult.warningReason,
    },
    warningReason: applyResult.warningReason,
  };
}

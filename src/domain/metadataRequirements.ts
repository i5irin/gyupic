import type {
  FilenameStrategy,
  FilenameTimestampSource,
  TimestampWriteMode,
} from './presets';

export type MetadataRequirements = {
  captureTime: {
    mode: TimestampWriteMode;
    enabled: boolean;
  };
  filename: {
    strategy: FilenameStrategy;
    timestampSource: FilenameTimestampSource;
  };
  needsCaptureTimeForFilenames: boolean;
};

export function buildMetadataRequirements(options: {
  filenameStrategy: FilenameStrategy;
  filenameTimestampSource: FilenameTimestampSource;
  timestampWriteMode: TimestampWriteMode;
}): MetadataRequirements {
  const { filenameStrategy, filenameTimestampSource, timestampWriteMode } =
    options;
  const captureEnabled = timestampWriteMode !== 'off';
  const needsCaptureTimeForFilenames =
    filenameStrategy === 'timestamped' &&
    filenameTimestampSource === 'captureTime';

  return {
    captureTime: {
      mode: timestampWriteMode,
      enabled: captureEnabled,
    },
    filename: {
      strategy: filenameStrategy,
      timestampSource: filenameTimestampSource,
    },
    needsCaptureTimeForFilenames,
  };
}

export function shouldDeriveCaptureTime(requirements: MetadataRequirements) {
  return (
    requirements.captureTime.enabled ||
    requirements.needsCaptureTimeForFilenames
  );
}

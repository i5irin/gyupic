import type { OutputFormat } from '../domain/presets';
import { ImageMimeTypes, type ImageMimeType } from '../models/image-file';

type OutputFormatConfig = {
  mime: ImageMimeType;
  extension: string;
  supportsQuality: boolean;
};

export const OUTPUT_FORMAT_CONFIG: Record<OutputFormat, OutputFormatConfig> = {
  jpeg: {
    mime: ImageMimeTypes.Jpeg,
    extension: '.jpg',
    supportsQuality: true,
  },
  png: {
    mime: ImageMimeTypes.Png,
    extension: '.png',
    supportsQuality: false,
  },
  webp: {
    mime: ImageMimeTypes.Webp,
    extension: '.webp',
    supportsQuality: true,
  },
  gif: {
    mime: ImageMimeTypes.Gif,
    extension: '.gif',
    supportsQuality: false,
  },
};

export function getOutputFormatConfig(
  format: OutputFormat,
): OutputFormatConfig {
  return OUTPUT_FORMAT_CONFIG[format];
}

import type { OutputFormat } from '../../domain/presets';
import { OUTPUT_FORMAT_CONFIG } from '../../shared/outputFormatConfig';

function isOffscreenCanvasAvailable(): boolean {
  return (
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

function deriveOutputName(input: File, extension: string): string {
  const index = input.name.lastIndexOf('.');
  if (index === -1) {
    return `${input.name}${extension}`;
  }
  return `${input.name.slice(0, index)}${extension}`;
}

export function canUseOffscreenConversion(): boolean {
  return typeof window === 'undefined' && isOffscreenCanvasAvailable();
}

export async function convertWithOffscreenCanvas(
  file: File,
  options: { format: OutputFormat; quality: number },
): Promise<File> {
  if (!isOffscreenCanvasAvailable()) {
    throw new Error('OffscreenCanvas is not available in this context.');
  }
  const config = OUTPUT_FORMAT_CONFIG[options.format];
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get OffscreenCanvasRenderingContext2D.');
  }
  ctx.drawImage(bitmap, 0, 0);
  if (typeof bitmap.close === 'function') {
    bitmap.close();
  }
  const blob = await canvas.convertToBlob({
    type: config.mime,
    ...(config.supportsQuality ? { quality: options.quality } : {}),
  });
  if (blob.type && blob.type !== config.mime) {
    // Safari and similar browsers return PNG when WebP encoding is unsupported, so fail fast here.
    throw new Error(
      `Requested ${config.mime} but browser produced ${blob.type}; this browser cannot encode the requested format.`,
    );
  }
  const outputName = deriveOutputName(file, config.extension);
  return new File([blob], outputName, { type: config.mime });
}

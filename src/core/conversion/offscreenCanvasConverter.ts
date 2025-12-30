import { ImageMimeTypes } from '../../models/image-file';

function isOffscreenCanvasAvailable(): boolean {
  return (
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

function deriveOutputName(input: File): string {
  const index = input.name.lastIndexOf('.');
  if (index === -1) {
    return `${input.name}.jpg`;
  }
  return `${input.name.slice(0, index)}.jpg`;
}

export function canUseOffscreenConversion(): boolean {
  return typeof window === 'undefined' && isOffscreenCanvasAvailable();
}

export async function convertWithOffscreenCanvas(
  file: File,
  quality: number,
): Promise<File> {
  if (!isOffscreenCanvasAvailable()) {
    throw new Error('OffscreenCanvas is not available in this context.');
  }
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
    type: ImageMimeTypes.Jpeg,
    quality,
  });
  const outputName = deriveOutputName(file);
  return new File([blob], outputName, { type: ImageMimeTypes.Jpeg });
}

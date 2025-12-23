export const ImageMimeTypes = {
  Jpeg: 'image/jpeg',
  Png: 'image/png',
} as const;

export type ImageMimeType =
  (typeof ImageMimeTypes)[keyof typeof ImageMimeTypes];

function getBaseName(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) {
    // Returns the entire filename if extension is missing
    return fileName;
  }
  return fileName.substring(0, lastDotIndex);
}

export default abstract class ImageFile {
  public readonly name: string;

  private objectURL: string | null = null;

  protected constructor(protected readonly file: File) {
    this.name = getBaseName(file.name);
  }

  private static loadImageOnCanvas(image: HTMLImageElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to getContext from canvas');
    }
    ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);
    return canvas;
  }

  public getObjectURL(): string {
    if (this.objectURL === null) {
      this.objectURL = URL.createObjectURL(this.file);
    }
    return this.objectURL;
  }

  public asFile(): File {
    return this.file;
  }

  public revokeObjectURL() {
    if (this.objectURL === null) {
      throw new Error();
    }
    URL.revokeObjectURL(this.objectURL);
    this.objectURL = null;
  }

  public async extractBlob(mimeType: string, quality?: number): Promise<Blob> {
    const img = await this.loadImage();
    const canvas = ImageFile.loadImageOnCanvas(img);
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create Blob'));
            }
          },
          mimeType,
          quality,
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  protected async loadHeader(): Promise<string> {
    const data = await this.file.arrayBuffer();
    return new Uint8Array(data)
      .subarray(0, 4)
      .reduce((chunk, byte) => chunk + byte.toString(16), '');
  }

  private async loadImage(): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const loadListener = () => {
        resolve(img);
      };
      const removeListener = () => {
        this.revokeObjectURL();
        img.removeEventListener('load', loadListener);
        img.removeEventListener('error', reject);
        img.removeEventListener('abort', reject);
        img.removeEventListener('loadend', removeListener);
      };
      img.addEventListener('load', loadListener);
      img.addEventListener('error', reject);
      img.addEventListener('abort', reject);
      img.addEventListener('loadend', removeListener);
      img.src = this.getObjectURL();
    });
  }

  protected abstract checkFileFormat(): Promise<boolean>;
}

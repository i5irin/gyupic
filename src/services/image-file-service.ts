import ImageFile, { ImageMimeTypes } from '../models/image-file';
import JpegFile from '../models/jpeg-file';
import PngFile from '../models/png-file';
import GenericImageFile from '../models/generic-image-file';
import type { OutputFormat } from '../domain/presets';
import { getOutputFormatConfig } from '../shared/outputFormatConfig';

export default class ImageFileService {
  public static async load(file: File): Promise<ImageFile> {
    const type = (file.type || '').toLowerCase();
    if (type.includes(ImageMimeTypes.Jpeg)) {
      return JpegFile.createFromFile(file);
    }
    if (type.includes(ImageMimeTypes.Png)) {
      return PngFile.createFromFile(file);
    }
    const genericCandidates = [
      ImageMimeTypes.Webp,
      ImageMimeTypes.Gif,
      ImageMimeTypes.Heic,
      ImageMimeTypes.Heif,
    ];
    if (genericCandidates.some((candidate) => type.includes(candidate))) {
      return GenericImageFile.createFromFile(file);
    }
    if (type.startsWith('image/')) {
      return GenericImageFile.createFromFile(file);
    }
    if (!type && /\.(jpe?g|png|gif|webp|heic|heif)$/iu.test(file.name || '')) {
      return GenericImageFile.createFromFile(file);
    }
    throw new Error('An unsupported file type is specified');
  }

  public static async convertToJpeg(
    imageFile: ImageFile,
    quality: number,
  ): Promise<JpegFile> {
    const blob = await imageFile.extractBlob(ImageMimeTypes.Jpeg, quality);
    const file = new File([blob], `${imageFile.name}.jpg`, {
      type: ImageMimeTypes.Jpeg,
    });
    return JpegFile.createFromFile(file);
  }

  public static async convertToFormat(
    imageFile: ImageFile,
    format: OutputFormat,
    quality: number,
  ): Promise<File> {
    const config = getOutputFormatConfig(format);
    const blob = await imageFile.extractBlob(
      config.mime,
      config.supportsQuality ? quality : undefined,
    );
    if (blob.type && blob.type !== config.mime) {
      // NOTE: Safari and similar browsers return PNG when WebP encoding is unsupported, so we treat that mismatch as a failure.
      throw new Error(
        `Requested ${config.mime} but browser produced ${blob.type}; this browser cannot encode the requested format.`,
      );
    }
    const fileName = `${imageFile.name}${config.extension}`;
    return new File([blob], fileName, {
      type: config.mime,
    });
  }
}

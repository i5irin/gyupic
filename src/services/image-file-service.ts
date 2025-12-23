import ImageFile, { ImageMimeTypes } from '../models/image-file';
import JpegFile from '../models/jpeg-file';
import PngFile from '../models/png-file';

export default class ImageFileService {
  public static async load(file: File): Promise<ImageFile> {
    if (file.type.includes(ImageMimeTypes.Jpeg)) {
      return JpegFile.createFromFile(file);
    }
    if (file.type.includes(ImageMimeTypes.Png)) {
      return PngFile.createFromFile(file);
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
}

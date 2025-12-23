import ImageFile from '../models/image-file';
import JpegFile from '../models/jpeg-file';

export type LoadedThumbnail = { key: string; file: ImageFile; url: string };
export type ConvertedThumbnail = { key: string; file: JpegFile; url: string };

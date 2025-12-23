import ImageFile from './image-file';

export default class JpegFile extends ImageFile {
  private constructor(file: File) {
    super(file);
  }

  static async createFromFile(file: File) {
    const jpeg = new JpegFile(file);
    const isValidFormat = await jpeg.checkFileFormat();
    if (!isValidFormat) {
      throw new Error('Invalid file format loaded');
    }
    return jpeg;
  }

  protected async checkFileFormat(): Promise<boolean> {
    const header = await this.loadHeader();
    return /^ffd8ff/.test(header);
  }
}

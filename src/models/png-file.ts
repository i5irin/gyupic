import ImageFile from './image-file';

export default class PngFile extends ImageFile {
  private constructor(file: File) {
    super(file);
  }

  public static async createFromFile(file: File) {
    const png = new PngFile(file);
    const isValidFormat = await png.checkFileFormat();
    if (!isValidFormat) {
      throw new Error('Invalid file format loaded');
    }
    return png;
  }

  protected async checkFileFormat(): Promise<boolean> {
    const header = await this.loadHeader();
    return /^89504e47/.test(header);
  }
}

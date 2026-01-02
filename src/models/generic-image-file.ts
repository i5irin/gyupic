import ImageFile from './image-file';

export default class GenericImageFile extends ImageFile {
  private constructor(file: File) {
    super(file);
  }

  static async createFromFile(file: File) {
    const instance = new GenericImageFile(file);
    const ok = await instance.checkFileFormat();
    if (!ok) {
      throw new Error('Invalid file format loaded');
    }
    return instance;
  }

  // NOTE: Accept the browser/runtime-supported formats without additional header checks.
  // eslint-disable-next-line class-methods-use-this
  protected async checkFileFormat(): Promise<boolean> {
    return true;
  }
}

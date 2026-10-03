import ViewBase from 'views/view-base/view-base';
import AttachViewError from 'views/errors';

type FileInputEvents = {
  change: (files: File[]) => void;
};

export default class FileInput extends ViewBase<FileInputEvents> {
  private constructor(
    readonly rootElement: HTMLDivElement,
    private readonly input: HTMLInputElement,
  ) {
    super();
  }

  static attach(root: HTMLDivElement) {
    const input = root.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) {
      throw new AttachViewError(
        'The File type input to be attached was not found.',
      );
    }
    const fileInput = new FileInput(root, input);
    FileInput.wire(fileInput);
    // input.addEventListener('change', , false);
    return fileInput;
  }

  private static wire(fileInput: FileInput) {
    fileInput.input.addEventListener('change', (e) => {
      if (e.target === null) {
        throw new Error();
      }
      // (e.target as HTMLInputElement).files
      // fileInput.on('change', ())
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      fileInput.emit('change', files);
    });
  }

  reset() {
    this.input.value = '';
  }
}

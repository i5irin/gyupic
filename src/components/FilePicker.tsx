import { RefObject } from 'react';

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  onFilesSelected: (files: File[]) => void | Promise<void>;
};

export default function FilePicker({ inputRef, onFilesSelected }: Props) {
  return (
    <div>
      <label htmlFor="files">
        Choose pictures
        <input
          ref={inputRef}
          type="file"
          id="files"
          accept="image/png"
          multiple
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            // Do nothing if nothing is selected
            if (files.length === 0) {
              return;
            }
            onFilesSelected(files);
          }}
        />
      </label>
    </div>
  );
}

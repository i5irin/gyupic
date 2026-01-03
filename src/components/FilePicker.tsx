import { RefObject } from 'react';
import type { InputBehavior } from '../domain/presets';

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  onFilesSelected: (files: File[]) => void | Promise<void>;
  behavior: InputBehavior;
};

export default function FilePicker({
  inputRef,
  onFilesSelected,
  behavior,
}: Props) {
  return (
    <div>
      <label htmlFor="files">
        {behavior.label}
        <input
          ref={inputRef}
          type="file"
          id="files"
          accept={behavior.accept}
          multiple={behavior.multiple}
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
      {behavior.note && (
        <p style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
          {behavior.note}
        </p>
      )}
    </div>
  );
}

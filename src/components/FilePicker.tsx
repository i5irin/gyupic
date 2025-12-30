import { RefObject, useMemo } from 'react';
import type { PickupId } from '../domain/pickupCatalog';

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  onFilesSelected: (files: File[]) => void | Promise<void>;
  pickupId: PickupId;
};

type PickupBehavior = {
  label: string;
  note: string;
  accept: string;
  multiple: boolean;
};

const PICKUP_BEHAVIORS: Record<PickupId, PickupBehavior> = {
  'pickup.photos': {
    label: 'Add from Photos',
    note: 'Use the iOS photo picker to select screenshots or camera roll items.',
    accept: 'image/*',
    multiple: true,
  },
  'pickup.files': {
    label: 'Add from Files / iCloud Drive',
    note: 'Use the Files dialog or drag & drop images. HEIC/JPEG/PNG are accepted (experimental).',
    accept: 'image/*,.heic,.jpeg,.jpg,.png',
    multiple: true,
  },
  'pickup.androidPicker': {
    label: 'Add from Android picker',
    note: 'Use the Android system picker or Share Target (experimental).',
    accept: 'image/*',
    multiple: true,
  },
  'pickup.desktop': {
    label: 'Add from Finder / Explorer',
    note: 'Drag & drop or select images from your computer (experimental).',
    accept: 'image/*',
    multiple: true,
  },
};

export default function FilePicker({
  inputRef,
  onFilesSelected,
  pickupId,
}: Props) {
  const behavior = useMemo(
    () => PICKUP_BEHAVIORS[pickupId] ?? PICKUP_BEHAVIORS['pickup.photos'],
    [pickupId],
  );

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

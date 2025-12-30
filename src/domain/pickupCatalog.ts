export const PickupIds = {
  Photos: 'pickup.photos',
  Files: 'pickup.files',
  AndroidPicker: 'pickup.androidPicker',
  Desktop: 'pickup.desktop',
} as const;

export type PickupId = (typeof PickupIds)[keyof typeof PickupIds];

export type PickupCategory = 'stable' | 'experimental';

export type PickupDefinition = {
  id: PickupId;
  title: string;
  description: string;
  category: PickupCategory;
};

export const PICKUP_CATALOG: Record<PickupId, PickupDefinition> = {
  [PickupIds.Photos]: {
    id: PickupIds.Photos,
    title: 'Photo Picker (iOS Safari)',
    description:
      'Import from the iOS Photos picker (screenshots / camera roll).',
    category: 'stable',
  },
  [PickupIds.Files]: {
    id: PickupIds.Files,
    title: 'Files / iCloud Drive',
    description: 'Select images via Files, iCloud Drive, or drag-and-drop.',
    category: 'experimental',
  },
  [PickupIds.AndroidPicker]: {
    id: PickupIds.AndroidPicker,
    title: 'Android System Picker',
    description: 'Use the Android system picker or share targets (planned).',
    category: 'experimental',
  },
  [PickupIds.Desktop]: {
    id: PickupIds.Desktop,
    title: 'Desktop Browser',
    description: 'Use Finder/Explorer dialogs or drag-and-drop on desktop.',
    category: 'experimental',
  },
};

export const DEFAULT_PICKUP_ID: PickupId = PickupIds.Photos;

export function getPickup(id: PickupId): PickupDefinition {
  return PICKUP_CATALOG[id];
}

export function listPickups(): PickupDefinition[] {
  return Object.values(PICKUP_CATALOG);
}

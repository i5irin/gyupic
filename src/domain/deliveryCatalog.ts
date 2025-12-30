export type DeliveryCategory = 'stable' | 'experimental';
export type DeliveryGuarantee = 'guaranteed' | 'best-effort' | 'unverified';
export type SortingAxis = 'exif' | 'file' | 'os' | 'unknown';

export const DeliveryIds = {
  Photos: 'delivery.photos',
  ShareSheet: 'delivery.shareSheet',
  Files: 'delivery.files',
  AndroidGallery: 'delivery.androidGallery',
  Desktop: 'delivery.desktop',
} as const;

export type DeliveryId = (typeof DeliveryIds)[keyof typeof DeliveryIds];

export type DeliveryDefinition = {
  id: DeliveryId;
  category: DeliveryCategory;
  title: string;
  description: string;
  sortingAxis: SortingAxis;
  guarantee: DeliveryGuarantee;
  warningCondition: string;
  bestEffortMessage?: string;
};

export const DELIVERY_CATALOG: Record<DeliveryId, DeliveryDefinition> = {
  [DeliveryIds.Photos]: {
    id: DeliveryIds.Photos,
    category: 'stable',
    title: 'iOS Photos App',
    description: 'Flow where converted images are saved back to the camera roll',
    sortingAxis: 'exif',
    guarantee: 'guaranteed',
    warningCondition:
      'Trigger a warning if extraction or reinjection of the Exif capture date/time fails',
  },
  [DeliveryIds.ShareSheet]: {
    id: DeliveryIds.ShareSheet,
    category: 'experimental',
    title: 'iOS Share Sheet',
    description: 'Share converted files directly via the iOS Share Sheet',
    sortingAxis: 'exif',
    guarantee: 'best-effort',
    warningCondition:
      'Trigger a warning if the Exif capture date/time cannot be written back, or if an ordering discrepancy is detected at the share destination',
    bestEffortMessage:
      'This sharing flow is best-effort. Ordering may depend on the destination app.',
  },
  [DeliveryIds.Files]: {
    id: DeliveryIds.Files,
    category: 'experimental',
    title: 'iOS Files App',
    description: 'Save into the Files app and reuse later via Finder/Shortcuts',
    sortingAxis: 'file',
    guarantee: 'unverified',
    warningCondition:
      'Not supported in the current phase. Files app sorts by download time and cannot be guaranteed.',
  },
  [DeliveryIds.AndroidGallery]: {
    id: DeliveryIds.AndroidGallery,
    category: 'experimental',
    title: 'Android Gallery',
    description: 'Android gallery / Google Photos flow (to be verified)',
    sortingAxis: 'unknown',
    guarantee: 'unverified',
    warningCondition:
      'Not guaranteed in current phase; always treated internally as a warning candidate',
  },
  [DeliveryIds.Desktop]: {
    id: DeliveryIds.Desktop,
    category: 'experimental',
    title: 'Desktop Finder / Explorer',
    description: 'Desktop file browser flow (macOS Finder / Windows Explorer)',
    sortingAxis: 'os',
    guarantee: 'unverified',
    warningCondition:
      'Not guaranteed in current phase; treated as a warning candidate until verification is complete',
  },
};

export const DEFAULT_DELIVERY_ID: DeliveryId = DeliveryIds.Photos;

export function getDelivery(id: DeliveryId): DeliveryDefinition | undefined {
  return DELIVERY_CATALOG[id];
}

export function listDeliveries(): DeliveryDefinition[] {
  return Object.values(DELIVERY_CATALOG);
}

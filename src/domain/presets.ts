import { PickupIds, type PickupId } from './pickupCatalog';
import {
  DeliveryIds,
  type DeliveryId,
  DELIVERY_CATALOG,
} from './deliveryCatalog';

export type MetadataPolicyMode =
  | 'strict'
  | 'strict-best-effort'
  | 'fallback-filetime';

export const PresetIds = {
  IosPhotosRecommended: 'preset.ios.photos.recommended',
  IosShareBeta: 'preset.ios.share.beta',
  IosFilesExperimental: 'preset.ios.files.experimental',
} as const;

export type PresetId = (typeof PresetIds)[keyof typeof PresetIds];

export type PresetDefinition = {
  id: PresetId;
  title: string;
  description: string;
  pickupId: PickupId;
  deliveryId: DeliveryId;
  defaultJpegQuality: number;
  metadataPolicyMode: MetadataPolicyMode;
  category: 'stable' | 'experimental';
  requiresHttps?: boolean;
  requiresNavigatorShareFiles?: boolean;
};

export const PRESETS: Record<PresetId, PresetDefinition> = {
  [PresetIds.IosPhotosRecommended]: {
    id: PresetIds.IosPhotosRecommended,
    title: 'Photos (Recommended)',
    description: 'Convert and return to the iOS Photos app.',
    pickupId: PickupIds.Photos,
    deliveryId: DeliveryIds.Photos,
    defaultJpegQuality: 0.85,
    metadataPolicyMode: 'strict',
    category: 'stable',
  },
  [PresetIds.IosShareBeta]: {
    id: PresetIds.IosShareBeta,
    title: 'Share Sheet (Beta)',
    description: 'Send converted images through the iOS Share Sheet.',
    pickupId: PickupIds.Photos,
    deliveryId: DeliveryIds.ShareSheet,
    defaultJpegQuality: 0.75,
    metadataPolicyMode: 'strict-best-effort',
    category: 'experimental',
    requiresHttps: true,
    requiresNavigatorShareFiles: true,
  },
  [PresetIds.IosFilesExperimental]: {
    id: PresetIds.IosFilesExperimental,
    title: 'Files (Experimental)',
    description: 'Save to Files / Finder for later organization.',
    pickupId: PickupIds.Photos,
    deliveryId: DeliveryIds.Files,
    defaultJpegQuality: 0.85,
    metadataPolicyMode: 'fallback-filetime',
    category: 'experimental',
  },
};

export const DEFAULT_PRESET_ID: PresetId = PresetIds.IosPhotosRecommended;

export function listPresets(): PresetDefinition[] {
  return Object.values(PRESETS);
}

export function getPreset(id: PresetId): PresetDefinition | undefined {
  return PRESETS[id];
}

export function getPresetDeliveryGuarantee(id: PresetId) {
  const preset = getPreset(id);
  if (!preset) {
    return undefined;
  }
  return DELIVERY_CATALOG[preset.deliveryId]?.guarantee;
}

export const DeliveryScenarioIds = {
  IosPhotos: 'ios.photos',
  IosShareSheet: 'ios.shareSheet',
  IosFiles: 'ios.files',
  AndroidTodo: 'android.todo',
  DesktopTodo: 'desktop.todo',
} as const;

export type DeliveryScenarioId =
  (typeof DeliveryScenarioIds)[keyof typeof DeliveryScenarioIds];

export type DeliveryScenarioCategory = 'stable' | 'experimental';

export type SortingAxis = 'exif' | 'os' | 'unknown';

export type Guarantee = 'guaranteed' | 'best-effort' | 'unverified';

export type DeliveryScenario = {
  id: DeliveryScenarioId;
  category: DeliveryScenarioCategory;
  title: string;
  description: string;
  sortingAxis: SortingAxis;
  guarantee: Guarantee;
  warningCondition: string;
};

export const DELIVERY_SCENARIOS: Record<DeliveryScenarioId, DeliveryScenario> =
  {
    [DeliveryScenarioIds.IosPhotos]: {
      id: DeliveryScenarioIds.IosPhotos,
      category: 'stable',
      title: 'iOS Photos App',
      description: 'A flow assuming write-back to the camera roll',
      sortingAxis: 'exif',
      guarantee: 'guaranteed',
      warningCondition:
        'Trigger a warning if extraction or reinjection of the Exif capture date/time fails',
    },
    [DeliveryScenarioIds.IosShareSheet]: {
      id: DeliveryScenarioIds.IosShareSheet,
      category: 'stable',
      title: 'iOS Share Sheet',
      description:
        'A flow that sends content from the share sheet to Messages, Mail, etc.',
      sortingAxis: 'exif',
      guarantee: 'best-effort',
      warningCondition:
        'Trigger a warning if the Exif capture date/time cannot be written back, or if an ordering discrepancy is detected at the share destination',
    },
    [DeliveryScenarioIds.IosFiles]: {
      id: DeliveryScenarioIds.IosFiles,
      category: 'stable',
      title: 'iOS Files App',
      description:
        'A flow where files are saved to the Files app and then returned to operation',
      sortingAxis: 'exif',
      guarantee: 'best-effort',
      warningCondition:
        'Trigger a warning if the written-back Exif cannot be confirmed or is lost during saving',
    },
    [DeliveryScenarioIds.AndroidTodo]: {
      id: DeliveryScenarioIds.AndroidTodo,
      category: 'experimental',
      title: 'Android Gallery',
      description: 'An Android gallery flow planned for investigation',
      sortingAxis: 'unknown',
      guarantee: 'unverified',
      warningCondition:
        'Not guaranteed in current phase; always treated internally as a warning candidate',
    },
    [DeliveryScenarioIds.DesktopTodo]: {
      id: DeliveryScenarioIds.DesktopTodo,
      category: 'experimental',
      title: 'Desktop (Finder / Explorer)',
      description: 'A file browser flow on macOS / Windows',
      sortingAxis: 'os',
      guarantee: 'unverified',
      warningCondition:
        'Not guaranteed in current phase; treated as a warning candidate until verification is complete',
    },
  };

export const DEFAULT_DELIVERY_SCENARIO_ID: DeliveryScenarioId =
  DeliveryScenarioIds.IosPhotos;

export function getDeliveryScenario(id: DeliveryScenarioId): DeliveryScenario {
  return DELIVERY_SCENARIOS[id];
}

export function isStableScenario(id: DeliveryScenarioId): boolean {
  return DELIVERY_SCENARIOS[id].category === 'stable';
}

export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'gif';

export type FilenameStrategy = 'keep-original' | 'timestamped';

export type FilenameTimestampSource = 'captureTime' | 'mtime';

export type TimestampWriteMode = 'off' | 'copy-exif' | 'from-file-modified';

export type OrderingRequirement = {
  sortingAxis: 'exif' | 'filename';
  /** Requires a valid Exif capture date to be written */
  needsExif?: boolean;
  /** Allows falling back to edited/lastModified timestamps when Exif is missing */
  allowEditedTimeFallback?: boolean;
};

export type PresetId =
  | 'scenario.photos-to-photos'
  | 'scenario.folders-to-photos'
  | 'scenario.photos-to-folders';

export type InputBehavior = {
  label: string;
  note: string;
  accept: string;
  multiple: boolean;
};

export type PresetDefinition = {
  id: PresetId;
  title: string;
  story: string;
  usage: string[];
  category: 'stable' | 'experimental';
  recommended?: boolean;
  ordering: OrderingRequirement;
  defaultSettings: {
    jpegQuality: number;
    outputFormat: OutputFormat;
    filenameStrategy: FilenameStrategy;
    filenameTimestampSource: FilenameTimestampSource;
    timestampWriteMode: TimestampWriteMode;
    rewriteExif: boolean;
    injectFromEditedTime: boolean;
  };
  inputBehavior: InputBehavior;
  environmentHints?: string[];
  requiresHttps?: boolean;
  requiresNavigatorShareFiles?: boolean;
};

const PRESETS: Record<PresetId, PresetDefinition> = {
  'scenario.photos-to-photos': {
    id: 'scenario.photos-to-photos',
    title: 'Return to Photos',
    story: 'Keep iOS/macOS Photos ordering intact when recompressing.',
    usage: [
      'Recompress screenshots sorted by capture date and return to Photos app.',
      'Convert images without changing their order in Photos.',
    ],
    category: 'stable',
    recommended: true,
    ordering: {
      sortingAxis: 'exif',
      needsExif: true,
      allowEditedTimeFallback: false,
    },
    defaultSettings: {
      jpegQuality: 0.85,
      outputFormat: 'jpeg',
      filenameStrategy: 'keep-original',
      filenameTimestampSource: 'captureTime',
      timestampWriteMode: 'copy-exif',
      rewriteExif: true,
      injectFromEditedTime: false,
    },
    inputBehavior: {
      label: 'Add from Photos',
      note: 'Use the iOS photo picker to select screenshots or camera roll items.',
      accept: 'image/*',
      multiple: true,
    },
  },
  'scenario.folders-to-photos': {
    id: 'scenario.folders-to-photos',
    title: 'Folders → Photos',
    story:
      'Promote files sorted by edited time (Finder/Files) back into Photos.',
    usage: [
      'Return images sorted by modified date in Folders/Files to Photos.',
      'Sort images picked from iCloud Drive / Files by capture date.',
    ],
    category: 'stable',
    ordering: {
      sortingAxis: 'exif',
      needsExif: true,
      allowEditedTimeFallback: true,
    },
    defaultSettings: {
      jpegQuality: 0.85,
      outputFormat: 'jpeg',
      filenameStrategy: 'keep-original',
      filenameTimestampSource: 'mtime',
      timestampWriteMode: 'from-file-modified',
      rewriteExif: true,
      injectFromEditedTime: true,
    },
    inputBehavior: {
      label: 'Add from Files / Finder',
      note: 'Drag & drop images or use the Files dialog. HEIC/JPEG/PNG accepted.',
      accept: 'image/*,.heic,.jpeg,.jpg,.png',
      multiple: true,
    },
  },
  'scenario.photos-to-folders': {
    id: 'scenario.photos-to-folders',
    title: 'Photos → Folders',
    story: 'Export Photos ordering into filename-sorted folders.',
    usage: [
      'Keep Photos app order while organizing in Finder/Explorer.',
      'Arrange in name order in iOS Photos → Windows/macOS/iOS Files.',
    ],
    category: 'stable',
    ordering: {
      sortingAxis: 'filename',
      needsExif: false,
      allowEditedTimeFallback: true,
    },
    defaultSettings: {
      jpegQuality: 0.85,
      outputFormat: 'jpeg',
      filenameStrategy: 'timestamped',
      filenameTimestampSource: 'captureTime',
      timestampWriteMode: 'copy-exif',
      rewriteExif: true,
      injectFromEditedTime: true,
    },
    inputBehavior: {
      label: 'Add from Photos',
      note: 'Select images from Photos / Camera Roll to export with timestamped filenames.',
      accept: 'image/*',
      multiple: true,
    },
  },
};

export const DEFAULT_PRESET_ID: PresetId = 'scenario.photos-to-photos';

export function listPresets(): PresetDefinition[] {
  return Object.values(PRESETS);
}

export function getPreset(
  id: PresetId | undefined,
): PresetDefinition | undefined {
  if (!id) {
    return PRESETS[DEFAULT_PRESET_ID];
  }
  return PRESETS[id];
}

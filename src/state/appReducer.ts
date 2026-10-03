import type {
  AppState,
  ConvertSettings,
  JobCaptureSnapshot,
  JobItem,
  JobErrorInfo,
} from './jobTypes';
import {
  DEFAULT_DELIVERY_ID,
  type DeliveryId,
} from '../domain/deliveryCatalog';
import { DEFAULT_PICKUP_ID, type PickupId } from '../domain/pickupCatalog';
import { DEFAULT_PRESET_ID, type PresetId, getPreset } from '../domain/presets';

export type AppAction =
  | { type: 'ADD_ITEMS'; items: JobItem[] }
  | { type: 'START_ITEM'; id: string }
  | {
      type: 'FINISH_ITEM';
      id: string;
      out: JobItem['out'];
      warningReason?: string;
    }
  | { type: 'FAIL_ITEM'; id: string; error: JobErrorInfo }
  | { type: 'RETRY_ITEM'; id: string }
  | { type: 'CANCEL_ITEM'; id: string }
  | { type: 'REQUEUE_ITEM'; id: string }
  | { type: 'END_ITEM'; id: string }
  | { type: 'CLEAR_SESSION' }
  | { type: 'SET_SETTINGS'; settings: Partial<ConvertSettings> }
  | { type: 'SET_PRESET'; presetId: PresetId }
  | { type: 'SET_DELIVERY'; deliveryId: DeliveryId }
  | { type: 'SET_PICKUP'; pickupId: PickupId };

function ensurePreset(id: PresetId | undefined) {
  return getPreset(id ?? DEFAULT_PRESET_ID) ?? getPreset(DEFAULT_PRESET_ID)!;
}

const defaultPreset = ensurePreset(DEFAULT_PRESET_ID);

export const initialState: AppState = {
  items: [],
  runId: 1,
  settings: {
    jpegQuality: defaultPreset.defaultJpegQuality,
    presetId: defaultPreset.id,
    metadataPolicyMode: defaultPreset.metadataPolicyMode,
  },
  settingsRev: 1,
  activeItemIds: [],
  lastAddedIds: [],
  presetId: defaultPreset.id,
  pickupId: defaultPreset.pickupId ?? DEFAULT_PICKUP_ID,
  deliveryId: defaultPreset.deliveryId ?? DEFAULT_DELIVERY_ID,
};

function updateItem(
  items: JobItem[],
  id: string,
  updater: (item: JobItem) => JobItem,
): JobItem[] {
  return items.map((it) => (it.id === id ? updater(it) : it));
}

export default function appReducer(
  state: AppState,
  action: AppAction,
): AppState {
  switch (action.type) {
    case 'ADD_ITEMS': {
      const ids = action.items.map((it) => it.id);
      return {
        ...state,
        items: [...state.items, ...action.items],
        lastAddedIds: ids,
      };
    }

    case 'START_ITEM': {
      const snapshot: JobCaptureSnapshot = {
        runId: state.runId,
        settingsRev: state.settingsRev,
        presetId: state.settings.presetId,
        pickupId: state.pickupId,
        deliveryId: state.deliveryId,
        startedAt: Date.now(),
      };
      return {
        ...state,
        activeItemIds: [...state.activeItemIds, action.id],
        items: updateItem(state.items, action.id, (it) => ({
          ...it,
          status: 'processing',
          isNew: false,
          error: undefined,
          warningReason: undefined,
          captured: snapshot,
        })),
      };
    }

    case 'FINISH_ITEM': {
      const status = action.warningReason ? 'warning' : 'done';
      return {
        ...state,
        activeItemIds: state.activeItemIds.filter((id) => id !== action.id),
        items: updateItem(state.items, action.id, (it) => ({
          ...it,
          status,
          out: action.out,
          error: undefined,
          warningReason: action.warningReason,
        })),
      };
    }

    case 'FAIL_ITEM': {
      return {
        ...state,
        activeItemIds: state.activeItemIds.filter((id) => id !== action.id),
        items: updateItem(state.items, action.id, (it) => ({
          ...it,
          status: 'error',
          error: action.error,
        })),
      };
    }

    case 'RETRY_ITEM': {
      return {
        ...state,
        items: updateItem(state.items, action.id, (it) => ({
          ...it,
          status: 'queued',
          out: undefined,
          error: undefined,
          warningReason: undefined,
          isNew: false,
        })),
      };
    }

    case 'CANCEL_ITEM': {
      // Cancel does NOT interrupt the underlying conversion.
      // - queued: remove from queue by marking as canceled.
      // - processing: release the active lock and mark as canceled.
      const target = state.items.find((it) => it.id === action.id);
      if (!target) {
        return state;
      }
      if (target.status !== 'queued' && target.status !== 'processing') {
        return state;
      }
      return {
        ...state,
        items: updateItem(state.items, action.id, (it) => ({
          ...it,
          status: 'canceled',
          isNew: false,
          out: undefined,
          error: undefined,
          warningReason: undefined,
        })),
      };
    }

    case 'REQUEUE_ITEM': {
      // Used when an in-flight conversion completed, but its result should be discarded
      // due to generation mismatch (e.g. settings changed). We clear the active lock
      // and put the item back into the queue.
      return {
        ...state,
        activeItemIds: state.activeItemIds.filter((id) => id !== action.id),
        items: updateItem(state.items, action.id, (it) => ({
          ...it,
          status: 'queued',
          out: undefined,
          error: undefined,
          warningReason: undefined,
          isNew: false,
        })),
      };
    }

    case 'END_ITEM': {
      return {
        ...state,
        activeItemIds: state.activeItemIds.filter((id) => id !== action.id),
      };
    }

    case 'SET_SETTINGS': {
      const nextSettings: ConvertSettings = {
        ...state.settings,
        ...action.settings,
      };
      return {
        ...state,
        settings: nextSettings,
        settingsRev: state.settingsRev + 1,
      };
    }

    case 'SET_PRESET': {
      const preset = ensurePreset(action.presetId);
      return {
        ...state,
        settings: {
          ...state.settings,
          jpegQuality: preset.defaultJpegQuality,
          presetId: preset.id,
          metadataPolicyMode: preset.metadataPolicyMode,
        },
        settingsRev: state.settingsRev + 1,
        presetId: preset.id,
        pickupId: preset.pickupId,
        deliveryId: preset.deliveryId,
      };
    }

    case 'CLEAR_SESSION': {
      // NOTE: ObjectURL revoke is handled outside the reducer.
      return {
        ...initialState,
        runId: state.runId + 1,
        settings: state.settings,
        settingsRev: state.settingsRev,
        presetId: state.presetId,
        pickupId: state.pickupId,
        deliveryId: state.deliveryId,
      };
    }

    case 'SET_DELIVERY': {
      return {
        ...state,
        deliveryId: action.deliveryId,
      };
    }

    case 'SET_PICKUP': {
      return {
        ...state,
        pickupId: action.pickupId,
      };
    }

    default:
      return state;
  }
}

import type { AppState, ConvertSettings, JobItem } from './jobTypes';

export type AppAction =
  | { type: 'ADD_ITEMS'; items: JobItem[] }
  | { type: 'START_ITEM'; id: string }
  | { type: 'FINISH_ITEM'; id: string; out: JobItem['out'] }
  | { type: 'FAIL_ITEM'; id: string; error: string }
  | { type: 'RETRY_ITEM'; id: string }
  | { type: 'CANCEL_ITEM'; id: string }
  | { type: 'REQUEUE_ITEM'; id: string }
  | { type: 'END_ITEM'; id: string }
  | { type: 'CLEAR_SESSION' }
  | { type: 'SET_SETTINGS'; settings: Partial<ConvertSettings> };

export const initialState: AppState = {
  items: [],
  runId: 1,
  settings: {
    jpegQuality: 1,
  },
  settingsRev: 1,
  activeItemId: null,
  lastAddedIds: [],
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
      return {
        ...state,
        activeItemId: action.id,
        items: updateItem(state.items, action.id, (it) => ({
          ...it,
          status: 'processing',
          isNew: false,
          error: undefined,
        })),
      };
    }

    case 'FINISH_ITEM': {
      return {
        ...state,
        activeItemId: null,
        items: updateItem(state.items, action.id, (it) => ({
          ...it,
          status: 'done',
          out: action.out,
          error: undefined,
        })),
      };
    }

    case 'FAIL_ITEM': {
      return {
        ...state,
        activeItemId: null,
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
        })),
      };
    }

    case 'REQUEUE_ITEM': {
      // Used when an in-flight conversion completed, but its result should be discarded
      // due to generation mismatch (e.g. settings changed). We clear the active lock
      // and put the item back into the queue.
      return {
        ...state,
        activeItemId:
          state.activeItemId === action.id ? null : state.activeItemId,
        items: updateItem(state.items, action.id, (it) => ({
          ...it,
          status: 'queued',
          out: undefined,
          error: undefined,
          isNew: false,
        })),
      };
    }

    case 'END_ITEM': {
      return {
        ...state,
        activeItemId:
          state.activeItemId === action.id ? null : state.activeItemId,
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

    case 'CLEAR_SESSION': {
      // NOTE: ObjectURL revoke is handled outside the reducer.
      return {
        ...initialState,
        runId: state.runId + 1,
        settings: state.settings,
        settingsRev: state.settingsRev,
      };
    }

    default:
      return state;
  }
}

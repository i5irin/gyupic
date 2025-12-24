import type { AppState, ConvertSettings, JobItem } from './jobTypes';

export type AppAction =
  | { type: 'ADD_ITEMS'; items: JobItem[] }
  | { type: 'START_ITEM'; id: string }
  | { type: 'FINISH_ITEM'; id: string; out: JobItem['out'] }
  | { type: 'FAIL_ITEM'; id: string; error: string }
  | { type: 'RETRY_ITEM'; id: string }
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

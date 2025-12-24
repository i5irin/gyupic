import { useCallback, useRef, useReducer, useState } from 'react';
import ImageFileService from './services/image-file-service';
import FilePicker from './components/FilePicker';
import ItemsGrid from './components/ItemsGrid';
import Toast from './components/Toast';
import appReducer, { initialState } from './state/appReducer';
import type { JobItem } from './state/jobTypes';
import { selectGridItems } from './state/selectors';

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as unknown as { randomUUID: () => string }).randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeRevokeObjectURL(url: string | undefined) {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // noop
  }
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);

    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 1800);
  }, []);

  const onReset = useCallback(() => {
    // Revoke all ObjectURLs we own (src/out previews).
    state.items.forEach((it) => {
      safeRevokeObjectURL(it.src.previewUrl);
      safeRevokeObjectURL(it.out?.previewUrl);
    });

    dispatch({ type: 'CLEAR_SESSION' });

    if (inputRef.current) {
      inputRef.current.value = '';
    }

    setToastMessage(null);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, [state.items]);

  const onChangeFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = await Promise.all(
        files.map(async (file) => {
          const imageFile = await ImageFileService.load(file);
          return { file, imageFile };
        }),
      );

      const newItems: JobItem[] = imageFiles.map(({ file, imageFile }) => ({
        id: createId(),
        createdAt: Date.now(),
        isNew: true,
        status: 'queued',
        src: {
          file,
          imageFile,
          previewUrl: URL.createObjectURL(file),
        },
      }));

      dispatch({ type: 'ADD_ITEMS', items: newItems });
      showToast(`Added (+${newItems.length})`);
    },
    [showToast],
  );

  const gridItems = selectGridItems(state.items);
  const scrollToId = state.lastAddedIds[state.lastAddedIds.length - 1];

  return (
    <div>
      <form>
        <FilePicker inputRef={inputRef} onFilesSelected={onChangeFiles} />

        <button type="button" onClick={onReset}>
          Reset
        </button>
      </form>

      <ItemsGrid items={gridItems} scrollToId={scrollToId} />

      {toastMessage && <Toast message={toastMessage} />}
    </div>
  );
}

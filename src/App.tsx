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

  // Keep manual conversion by button (to be replaced with automatic conversion by queue later)
  const onConvert = useCallback(() => {
    const run = async () => {
      const targets = state.items.filter((it) => it.status === 'queued');

      await Promise.all(
        targets.map(async (item) => {
          dispatch({ type: 'START_ITEM', id: item.id });
          try {
            const converted = await ImageFileService.convertToJpeg(
              item.src.imageFile,
              state.settings.jpegQuality,
            );

            const outFile = converted.asFile();
            const previewUrl = URL.createObjectURL(outFile);

            const sizeBefore = item.src.file.size;
            const sizeAfter = outFile.size;
            const reductionRatio =
              sizeBefore > 0
                ? Math.max(0, (sizeBefore - sizeAfter) / sizeBefore)
                : 0;

            dispatch({
              type: 'FINISH_ITEM',
              id: item.id,
              out: {
                file: outFile,
                previewUrl,
                sizeBefore,
                sizeAfter,
                reductionRatio,
              },
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            dispatch({ type: 'FAIL_ITEM', id: item.id, error: msg });
          }
        }),
      );
    };

    run();
  }, [state.items, state.settings.jpegQuality]);

  const gridItems = selectGridItems(state.items);
  const scrollToId = state.lastAddedIds[state.lastAddedIds.length - 1];

  return (
    <div>
      <form>
        <FilePicker inputRef={inputRef} onFilesSelected={onChangeFiles} />

        <button type="button" onClick={onReset}>
          Reset
        </button>
        <button type="button" onClick={onConvert}>
          Convert
        </button>
      </form>

      <ItemsGrid items={gridItems} scrollToId={scrollToId} />

      {toastMessage && <Toast message={toastMessage} />}
    </div>
  );
}

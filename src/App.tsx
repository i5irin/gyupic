import { useCallback, useEffect, useRef, useReducer, useState } from 'react';
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

  // Keep a ref to the latest state so async conversions can validate generation.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Local lock to avoid starting multiple conversions due to effect re-runs
  // (e.g. React StrictMode, rapid re-renders).
  const inFlightRef = useRef<string | null>(null);

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

  const onRetry = useCallback(
    (id: string) => {
      dispatch({ type: 'RETRY_ITEM', id });
    },
    [dispatch],
  );

  const onDownload = useCallback(() => {
    // no-op
  }, []);

  // Automatic conversion queue (single concurrency).
  // When there is no active processing item, automatically start the next queued item.
  useEffect(() => {
    const latest = stateRef.current;

    if (inFlightRef.current !== null) {
      return;
    }
    if (latest.activeItemId !== null) {
      return;
    }

    const next = latest.items.find((it) => it.status === 'queued');
    if (!next) {
      return;
    }

    const startedRunId = latest.runId;
    const startedSettingsRev = latest.settingsRev;
    const startedQuality = latest.settings.jpegQuality;

    inFlightRef.current = next.id;
    dispatch({ type: 'START_ITEM', id: next.id });

    const run = async () => {
      try {
        const converted = await ImageFileService.convertToJpeg(
          next.src.imageFile,
          startedQuality,
        );

        const outFile = converted.asFile();
        const sizeBefore = next.src.file.size;
        const sizeAfter = outFile.size;
        const reductionRatio =
          sizeBefore > 0
            ? Math.max(0, (sizeBefore - sizeAfter) / sizeBefore)
            : 0;

        // Generation guard: only commit if the run/settings generation is still current.
        const now1 = stateRef.current;
        const isCurrentGen1 =
          now1.runId === startedRunId &&
          now1.settingsRev === startedSettingsRev;

        if (!isCurrentGen1) {
          // If the item still exists, put it back to the queue so it can be processed
          // with the latest settings.
          if (now1.items.some((it) => it.id === next.id)) {
            dispatch({ type: 'REQUEUE_ITEM', id: next.id });
          }
          return;
        }

        // Create ObjectURL only after we know it is likely to be accepted.
        const previewUrl = URL.createObjectURL(outFile);

        // Re-check generation just before dispatch, to avoid races.
        const now2 = stateRef.current;
        const isCurrentGen2 =
          now2.runId === startedRunId &&
          now2.settingsRev === startedSettingsRev;
        if (!isCurrentGen2) {
          safeRevokeObjectURL(previewUrl);
          if (now2.items.some((it) => it.id === next.id)) {
            dispatch({ type: 'REQUEUE_ITEM', id: next.id });
          }
          return;
        }

        dispatch({
          type: 'FINISH_ITEM',
          id: next.id,
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

        const now = stateRef.current;
        const isCurrentGen =
          now.runId === startedRunId && now.settingsRev === startedSettingsRev;
        if (!isCurrentGen) {
          if (now.items.some((it) => it.id === next.id)) {
            dispatch({ type: 'REQUEUE_ITEM', id: next.id });
          }
          return;
        }

        dispatch({ type: 'FAIL_ITEM', id: next.id, error: msg });
      } finally {
        inFlightRef.current = null;
      }
    };

    run();
  }, [state.items, state.activeItemId, state.runId, state.settingsRev]);

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

      <ItemsGrid
        items={gridItems}
        scrollToId={scrollToId}
        onRetry={onRetry}
        onDownload={onDownload}
      />

      {toastMessage && <Toast message={toastMessage} />}
    </div>
  );
}

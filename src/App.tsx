import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useReducer,
  useState,
} from 'react';
import ImageFileService from './services/image-file-service';
import FilePicker from './components/FilePicker';
import ItemsGrid from './components/ItemsGrid';
import Toast from './components/Toast';
import SettingsPanel from './components/SettingsPanel';
import appReducer, { initialState } from './state/appReducer';
import type { JobItem } from './state/jobTypes';
import { selectGridItems } from './state/selectors';
import {
  DELIVERY_CATALOG,
  DeliveryIds,
  getDelivery,
} from './domain/deliveryCatalog';
import { getPickup } from './domain/pickupCatalog';
import { listPresets, getPreset, type PresetId } from './domain/presets';
import { createPerfRecorder, runPerfSpan } from './utils/perfTrace';
import QueueManager from './core/execution/queueManager';

type PresetOptionView = {
  id: PresetId;
  title: string;
  description: string;
  guarantee: 'guaranteed' | 'best-effort' | 'unverified';
  category: 'stable' | 'experimental';
  disabled: boolean;
  disabledReason?: string;
};

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
    // No operation
  }
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queueManagerRef = useRef<QueueManager | null>(null);
  const activePreviewMapRef = useRef<Map<string, string>>(new Map());

  // Keep a ref to the latest state so async conversions can validate generation.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(
    () => () => {
      activePreviewMapRef.current.forEach((url) => {
        safeRevokeObjectURL(url);
      });
      activePreviewMapRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    const manager = new QueueManager({
      dispatch,
      getState: () => stateRef.current,
      createObjectURL: (file) => URL.createObjectURL(file),
      revokeObjectURL: safeRevokeObjectURL,
    });
    queueManagerRef.current = manager;
    manager.sync();
    return () => {
      manager.dispose();
      queueManagerRef.current = null;
    };
  }, [dispatch]);

  useEffect(() => {
    queueManagerRef.current?.sync();
  }, [
    state.items,
    state.settings,
    state.settingsRev,
    state.runId,
    state.pickupId,
    state.deliveryId,
  ]);

  useEffect(() => {
    const nextMap = new Map<string, string>();
    state.items.forEach((item) => {
      if (
        (item.status === 'done' || item.status === 'warning') &&
        item.out?.previewUrl
      ) {
        nextMap.set(item.id, item.out.previewUrl);
      }
    });
    const prevMap = activePreviewMapRef.current;
    prevMap.forEach((url, id) => {
      const same = nextMap.get(id) === url;
      if (!same) {
        safeRevokeObjectURL(url);
      }
    });
    activePreviewMapRef.current = nextMap;
  }, [state.items]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [shareSupported, setShareSupported] = useState(false);

  const environmentInfo = useMemo(() => {
    if (typeof window === 'undefined') {
      return { isHttps: false, canShareFiles: false };
    }
    const isHttps =
      window.location.protocol === 'https:' || window.isSecureContext === true;
    let canShareFiles = false;
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData & { files?: File[] }) => boolean;
    };
    if (typeof nav?.canShare === 'function' && typeof File === 'function') {
      try {
        const testFile = new File(['gyupic'], 'check.txt', {
          type: 'text/plain',
        });
        canShareFiles = nav.canShare({ files: [testFile] });
      } catch {
        canShareFiles = false;
      }
    }
    return { isHttps, canShareFiles };
  }, []);

  const presetOptions = useMemo<PresetOptionView[]>(
    () =>
      listPresets()
        .map((preset) => {
          const delivery = DELIVERY_CATALOG[preset.deliveryId];
          const issues: string[] = [];
          if (preset.requiresHttps && !environmentInfo.isHttps) {
            issues.push('HTTPS connection required');
          }
          if (
            preset.requiresNavigatorShareFiles &&
            !environmentInfo.canShareFiles
          ) {
            issues.push('Device cannot share files via Share Sheet');
          }
          return {
            id: preset.id,
            title: preset.title,
            description: preset.description,
            guarantee: delivery?.guarantee ?? 'guaranteed',
            category: preset.category,
            disabled: issues.length > 0,
            disabledReason: issues.length > 0 ? issues.join(' / ') : undefined,
          };
        })
        .sort((a, b) => {
          if (a.disabled === b.disabled) {
            return 0;
          }
          return a.disabled ? 1 : -1;
        }),
    [environmentInfo],
  );

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

  useEffect(() => {
    setShareSupported(environmentInfo.canShareFiles);
  }, [environmentInfo]);

  useEffect(() => {
    const currentPreset = presetOptions.find(
      (option) => option.id === state.settings.presetId,
    );
    if (currentPreset && !currentPreset.disabled) {
      return;
    }
    const fallback = presetOptions.find((option) => !option.disabled);
    if (!fallback || fallback.id === state.settings.presetId) {
      return;
    }
    dispatch({ type: 'SET_PRESET', presetId: fallback.id });
    if (currentPreset?.disabledReason) {
      showToast(
        `${currentPreset.title} unavailable: ${currentPreset.disabledReason}`,
      );
    }
  }, [presetOptions, state.settings.presetId, dispatch, showToast]);

  const onReset = useCallback(() => {
    queueManagerRef.current?.cancelAllActive('reset');
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
      const batchRecorder = createPerfRecorder({
        scenario: 'file-load',
        count: files.length,
      });
      const results = await Promise.allSettled(
        files.map(async (file) => {
          const itemRecorder = createPerfRecorder({
            scenario: 'file-load',
            type: file.type,
            size: file.size,
          });
          try {
            await runPerfSpan(itemRecorder, 'load-image', () =>
              ImageFileService.load(file),
            );
            return { file };
          } finally {
            itemRecorder?.commit();
          }
        }),
      );
      const ok = results
        .filter(
          (r): r is PromiseFulfilledResult<{ file: File }> =>
            r.status === 'fulfilled',
        )
        .map((r) => r.value);
      const failedCount = results.length - ok.length;
      batchRecorder?.commit({
        loaded: ok.length,
        failed: failedCount,
      });
      if (failedCount > 0) {
        showToast(`Skipped ${failedCount} invalid file(s).`);
      }
      if (ok.length === 0) {
        return;
      }

      const newItems: JobItem[] = ok.map(({ file }) => ({
        id: createId(),
        createdAt: Date.now(),
        isNew: true,
        status: 'queued',
        src: {
          file,
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
      const { current } = stateRef;
      const item = current.items.find((it) => it.id === id);
      if (!item) {
        return;
      }

      safeRevokeObjectURL(item.out?.previewUrl);
      dispatch({ type: 'RETRY_ITEM', id });
    },
    [dispatch],
  );

  const onDownload = useCallback(
    (id: string) => {
      const { current } = stateRef;
      const item = current.items.find((it) => it.id === id);
      if (!item) {
        showToast('Download unavailable (item not found).');
        return;
      }
      if (item.status !== 'done' && item.status !== 'warning') {
        showToast('Download is available after conversion finishes.');
        return;
      }
      const file = item.out?.file;
      if (!file) {
        showToast('Download failed. Please retry conversion.');
        return;
      }

      try {
        const url = URL.createObjectURL(file);

        const a = document.createElement('a');
        a.href = url;
        a.download = file.name || 'image.jpg';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();

        // Revoke ASAP (after click is queued)
        window.setTimeout(() => {
          safeRevokeObjectURL(url);
        }, 0);
      } catch (e) {
        showToast('Download failed.');
      }
    },
    [showToast],
  );

  const onCancel = useCallback(
    (id: string) => {
      const { current } = stateRef;
      const item = current.items.find((it) => it.id === id);
      if (!item) {
        return;
      }
      if (item.status !== 'queued' && item.status !== 'processing') {
        return;
      }
      safeRevokeObjectURL(item.out?.previewUrl);
      dispatch({ type: 'CANCEL_ITEM', id });
      showToast('Canceled.');
    },
    [showToast],
  );

  const onApplySettings = useCallback(
    (jpegQuality: number) => {
      dispatch({ type: 'SET_SETTINGS', settings: { jpegQuality } });
      showToast(`Quality applied: ${Math.round(jpegQuality * 100)}%`);
    },
    [dispatch, showToast],
  );

  const onChangePreset = useCallback(
    (presetId: string) => {
      const typedId = presetId as PresetId;
      const target = presetOptions.find((option) => option.id === typedId);
      if (target?.disabled) {
        if (target.disabledReason) {
          showToast(target.disabledReason);
        }
        return;
      }
      dispatch({ type: 'SET_PRESET', presetId: typedId });
      const preset = getPreset(typedId);
      if (preset) {
        showToast(`Preset: ${preset.title}`);
      }
    },
    [dispatch, showToast, presetOptions],
  );

  const onShare = useCallback(
    async (id: string) => {
      if (!shareSupported) {
        showToast('Sharing is not supported on this device.');
        return;
      }
      const { current } = stateRef;
      const item = current.items.find((it) => it.id === id);
      if (!item) {
        showToast('Share unavailable (item not found).');
        return;
      }
      if (item.status !== 'done' && item.status !== 'warning') {
        showToast('Share is available after conversion finishes.');
        return;
      }
      const file = item.out?.file;
      if (!file) {
        showToast('Share failed. Please retry conversion.');
        return;
      }
      const shareData: ShareData & { files: File[] } = {
        title: 'Gyuppiku Output',
        files: [file],
      };
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (typeof nav.canShare === 'function' && !nav.canShare(shareData)) {
        showToast('Sharing files is not supported on this device.');
        return;
      }
      try {
        await nav.share(shareData);
        if (stateRef.current.deliveryId === DeliveryIds.Files) {
          showToast('Select “Save to Files” to keep the order.');
        } else {
          showToast('Shared.');
        }
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          return;
        }
        showToast('Share failed.');
      }
    },
    [shareSupported, showToast],
  );

  const gridItems = selectGridItems(state.items);
  const queueSummary = useMemo(() => {
    const counts: Record<
      'queued' | 'processing' | 'done' | 'warning' | 'error' | 'canceled',
      number
    > = {
      queued: 0,
      processing: 0,
      done: 0,
      warning: 0,
      error: 0,
      canceled: 0,
    };
    state.items.forEach((item) => {
      counts[item.status as keyof typeof counts] += 1;
    });
    const total = state.items.length;
    const completed = counts.done + counts.warning;
    const percentComplete =
      total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      total,
      completed,
      waiting: counts.queued,
      processing: counts.processing,
      errors: counts.error,
      percentComplete,
    };
  }, [state.items]);
  const selectedPickup = getPickup(state.pickupId);
  const selectedDelivery = getDelivery(state.deliveryId);
  const scrollToId = state.lastAddedIds[state.lastAddedIds.length - 1];

  return (
    <div>
      <form>
        <FilePicker
          inputRef={inputRef}
          onFilesSelected={onChangeFiles}
          pickupId={state.pickupId}
        />

        <button type="button" onClick={onReset}>
          Reset
        </button>
      </form>

      <SettingsPanel
        currentJpegQuality={state.settings.jpegQuality}
        presetId={state.settings.presetId}
        presetOptions={presetOptions}
        onChangePreset={onChangePreset}
        pickupInfo={
          selectedPickup
            ? {
                title: selectedPickup.title,
                description: selectedPickup.description,
              }
            : undefined
        }
        deliveryInfo={
          selectedDelivery
            ? {
                title: selectedDelivery.title,
                description: selectedDelivery.description,
                guarantee: selectedDelivery.guarantee,
              }
            : undefined
        }
        onApply={onApplySettings}
      />

      <ItemsGrid
        items={gridItems}
        scrollToId={scrollToId}
        onRetry={onRetry}
        onDownload={onDownload}
        onCancel={onCancel}
        onShare={shareSupported ? onShare : undefined}
        queueSummary={queueSummary}
      />

      {toastMessage && <Toast message={toastMessage} />}
    </div>
  );
}

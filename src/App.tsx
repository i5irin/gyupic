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
  createProcessingExecutor,
  type ProcessingExecutor,
} from './core/execution/processingExecutor';
import {
  DELIVERY_CATALOG,
  DeliveryIds,
  getDelivery,
} from './domain/deliveryCatalog';
import { getPickup } from './domain/pickupCatalog';
import { listPresets, getPreset, type PresetId } from './domain/presets';
import { createPerfRecorder, runPerfSpan } from './utils/perfTrace';

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
  const executorRef = useRef<ProcessingExecutor | null>(null);

  // Keep a ref to the latest state so async conversions can validate generation.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const executor = createProcessingExecutor();
    executorRef.current = executor;
    return () => {
      executor.terminate();
      executorRef.current = null;
    };
  }, []);

  // Local lock to avoid starting multiple conversions due to effect re-runs
  // (e.g. React StrictMode, rapid re-renders).
  const inFlightRef = useRef<string | null>(null);

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

  const isCanceledNow = (id: string) => {
    const now = stateRef.current;
    const it = now.items.find((x) => x.id === id);
    return it?.status === 'canceled';
  };

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
    const startedPickupId = latest.pickupId;
    const startedDeliveryId = latest.deliveryId;
    const startedPresetId = latest.settings.presetId;
    const startedMetadataPolicyMode = latest.settings.metadataPolicyMode;

    inFlightRef.current = next.id;
    dispatch({ type: 'START_ITEM', id: next.id });

    const executor = executorRef.current;
    if (!executor) {
      return;
    }

    const run = async () => {
      try {
        const prepRecorder = createPerfRecorder({
          scenario: 'processing-prep',
          pickupId: startedPickupId,
          deliveryId: startedDeliveryId,
          presetId: startedPresetId,
        });
        let preparedFile: File;
        try {
          const imageFile = await runPerfSpan(
            prepRecorder,
            'loadSourceImage',
            () => ImageFileService.load(next.src.file),
          );
          const converted = await runPerfSpan(
            prepRecorder,
            'convertToJpeg',
            () => ImageFileService.convertToJpeg(imageFile, startedQuality),
          );
          preparedFile = converted.asFile();
        } finally {
          prepRecorder?.commit();
        }

        if (isCanceledNow(next.id)) {
          dispatch({ type: 'END_ITEM', id: next.id });
          return;
        }

        const pipelineResult = await executor.run({
          sourceFile: next.src.file,
          preparedFile,
          jpegQuality: startedQuality,
          pickupId: startedPickupId,
          deliveryId: startedDeliveryId,
          presetId: startedPresetId,
          metadataPolicyMode: startedMetadataPolicyMode,
        });
        const {
          file: outFile,
          sizeBefore,
          sizeAfter,
          reductionRatio,
          metadata,
          warningReason,
        } = pipelineResult;

        if (isCanceledNow(next.id)) {
          dispatch({ type: 'END_ITEM', id: next.id });
          return;
        }

        // Generation guard: only commit if the run/settings generation is still current.
        const now1 = stateRef.current;
        const isCurrentGen1 =
          now1.runId === startedRunId &&
          now1.settingsRev === startedSettingsRev;

        if (!isCurrentGen1) {
          const nowItem = now1.items.find((it) => it.id === next.id);
          if (nowItem?.status === 'canceled') {
            dispatch({ type: 'END_ITEM', id: next.id });
          } else if (nowItem) {
            // If the item still exists, put it back to the queue so it can be processed
            // with the latest settings.
            dispatch({ type: 'REQUEUE_ITEM', id: next.id });
          }
          return;
        }

        // Create ObjectURL only after we know it is likely to be accepted.
        const previewUrl = URL.createObjectURL(outFile);

        if (isCanceledNow(next.id)) {
          safeRevokeObjectURL(previewUrl);
          dispatch({ type: 'END_ITEM', id: next.id });
          return;
        }

        // Re-check generation just before dispatch, to avoid races.
        const now2 = stateRef.current;
        const isCurrentGen2 =
          now2.runId === startedRunId &&
          now2.settingsRev === startedSettingsRev;
        if (!isCurrentGen2) {
          safeRevokeObjectURL(previewUrl);
          const nowItem2 = now2.items.find((it) => it.id === next.id);
          if (nowItem2?.status === 'canceled') {
            dispatch({ type: 'END_ITEM', id: next.id });
          } else if (nowItem2) {
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
            metadata,
          },
          warningReason,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';

        if (isCanceledNow(next.id)) {
          dispatch({ type: 'END_ITEM', id: next.id });
          return;
        }

        const now = stateRef.current;
        const isCurrentGen =
          now.runId === startedRunId && now.settingsRev === startedSettingsRev;
        if (!isCurrentGen) {
          const nowItem = now.items.find((it) => it.id === next.id);
          if (nowItem?.status === 'canceled') {
            dispatch({ type: 'END_ITEM', id: next.id });
          } else if (nowItem) {
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
      />

      {toastMessage && <Toast message={toastMessage} />}
    </div>
  );
}

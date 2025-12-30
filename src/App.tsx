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
import { runProcessingPipeline } from './core/pipeline/processingPipeline';
import {
  DELIVERY_CATALOG,
  DeliveryIds,
  type DeliveryId,
  getDelivery,
} from './domain/deliveryCatalog';
import {
  PICKUP_CATALOG,
  type PickupId,
  getPickup,
} from './domain/pickupCatalog';

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
  const [shareSupported, setShareSupported] = useState(false);

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
    const supported =
      typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    setToastMessage(
      JSON.stringify({
        supported,
        shareType: typeof (navigator as any).share,
        isSecureContext,
        protocol: window.location.protocol,
        href: window.location.href,
      }),
    );
    setShareSupported(supported);
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
      const results = await Promise.allSettled(
        files.map(async (file) => {
          const imageFile = await ImageFileService.load(file);
          return { file, imageFile };
        }),
      );
      const ok = results
        .filter(
          (r): r is PromiseFulfilledResult<{ file: File; imageFile: any }> =>
            r.status === 'fulfilled',
        )
        .map((r) => r.value);
      const failedCount = results.length - ok.length;
      if (failedCount > 0) {
        showToast(`Skipped ${failedCount} invalid file(s).`);
      }
      if (ok.length === 0) {
        return;
      }

      const newItems: JobItem[] = ok.map(({ file, imageFile }) => ({
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

  const pickupOptions = useMemo(
    () =>
      Object.values(PICKUP_CATALOG)
        .filter((pickup) => pickup.category === 'stable')
        .map((pickup) => ({
          id: pickup.id,
          title: pickup.title,
          description: pickup.description,
        })),
    [],
  );

  const deliveryOptions = useMemo(
    () =>
      Object.values(DELIVERY_CATALOG)
        .filter((delivery) => delivery.category === 'stable')
        .map((delivery) => ({
          id: delivery.id,
          title: delivery.title,
          description: delivery.description,
          guarantee: delivery.guarantee,
        })),
    [],
  );

  const onChangePickup = useCallback(
    (pickupId: string) => {
      const typedId = pickupId as PickupId;
      if (typedId === stateRef.current.pickupId) {
        return;
      }
      dispatch({ type: 'SET_PICKUP', pickupId: typedId });
      const pickup = getPickup(typedId);
      if (pickup) {
        showToast(`Pickup: ${pickup.title}`);
      }
    },
    [dispatch, showToast],
  );

  const onChangeDelivery = useCallback(
    (deliveryId: string) => {
      const typedId = deliveryId as DeliveryId;
      if (typedId === stateRef.current.deliveryId) {
        return;
      }
      dispatch({ type: 'SET_DELIVERY', deliveryId: typedId });
      const delivery = getDelivery(typedId);
      if (delivery) {
        showToast(`Delivery: ${delivery.title}`);
      }
    },
    [dispatch, showToast],
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

    inFlightRef.current = next.id;
    dispatch({ type: 'START_ITEM', id: next.id });

    const run = async () => {
      try {
        const pipelineResult = await runProcessingPipeline({
          sourceFile: next.src.file,
          sourceImage: next.src.imageFile,
          jpegQuality: startedQuality,
          pickupId: startedPickupId,
          deliveryId: startedDeliveryId,
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
  const scrollToId = state.lastAddedIds[state.lastAddedIds.length - 1];

  return (
    <div>
      <form>
        <FilePicker inputRef={inputRef} onFilesSelected={onChangeFiles} />

        <button type="button" onClick={onReset}>
          Reset
        </button>
      </form>

      <SettingsPanel
        currentJpegQuality={state.settings.jpegQuality}
        pickupId={state.pickupId}
        pickupOptions={pickupOptions}
        onChangePickup={onChangePickup}
        deliveryId={state.deliveryId}
        deliveryOptions={deliveryOptions}
        onChangeDelivery={onChangeDelivery}
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

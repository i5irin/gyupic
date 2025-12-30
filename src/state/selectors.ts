import type { JobItem, JobStatus } from './jobTypes';

export type GridActionState = {
  canRetry: boolean;
  canDownload: boolean;
  canCancel: boolean;
  canShare: boolean;
};

export type GridItem = {
  id: string;
  createdAt: number;
  previewUrl: string;
  status: JobStatus;
  isNew: boolean;
  error?: string;
  warningReason?: string;
  actions: GridActionState;
};

export function selectGridItems(items: JobItem[]): GridItem[] {
  return items.map((it) => {
    const previewUrl =
      (it.status === 'done' || it.status === 'warning') && it.out?.previewUrl
        ? it.out.previewUrl
        : it.src.previewUrl;

    const actions: GridActionState = {
      canRetry: it.status === 'error' || it.status === 'warning',
      canDownload: it.status === 'done' || it.status === 'warning',
      canCancel: it.status === 'queued' || it.status === 'processing',
      canShare: it.status === 'done' || it.status === 'warning',
    };

    return {
      id: it.id,
      createdAt: it.createdAt,
      previewUrl,
      status: it.status,
      isNew: it.isNew,
      error: it.error,
      warningReason: it.warningReason,
      actions,
    };
  });
}

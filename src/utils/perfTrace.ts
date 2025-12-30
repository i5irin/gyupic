/* eslint-disable no-console */
/* eslint-disable no-underscore-dangle */
type PerfScenario = 'file-load' | 'processing-pipeline';

type PerfMeta = {
  [key: string]: string | number | boolean | undefined;
  scenario: PerfScenario;
};

type PerfSpan = {
  label: string;
  durationMs: number;
  status: 'ok' | 'error';
};

type PerfLogEntry = {
  meta: PerfMeta;
  spans: PerfSpan[];
  totalMs: number;
  extra?: Record<string, unknown>;
  timestamp: string;
};

export interface PerfRecorder {
  trace<T>(label: string, fn: () => Promise<T>): Promise<T>;
  commit(extra?: Record<string, unknown>): void;
}

const PERF_TRACE_FLAG_KEY = 'gyupic:perfTrace.enabled';
const PERF_TRACE_QUERY_KEY = 'perfTrace';

declare global {
  interface Window {
    __gyupicPerfLog?: PerfLogEntry[];
  }
}

function nowMs(): number {
  if (
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
  ) {
    return performance.now();
  }
  return Date.now();
}

function syncFlagFromQuery(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(PERF_TRACE_QUERY_KEY)) {
      return;
    }
    const raw = params.get(PERF_TRACE_QUERY_KEY);
    const enabled = raw === '1' || raw === 'true';
    window.localStorage.setItem(PERF_TRACE_FLAG_KEY, enabled ? '1' : '0');
  } catch {
    // No operation
  }
}

function readFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  syncFlagFromQuery();
  try {
    return window.localStorage.getItem(PERF_TRACE_FLAG_KEY) === '1';
  } catch {
    // No operation
    return false;
  }
}

export function isPerfTraceEnabled(): boolean {
  return readFlag();
}

function pushLog(entry: PerfLogEntry): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (!window.__gyupicPerfLog) {
    window.__gyupicPerfLog = [];
  }
  window.__gyupicPerfLog.push(entry);
  const label = `[gyupic:perf] ${entry.meta.scenario}`;
  if (console && typeof console.groupCollapsed === 'function') {
    console.groupCollapsed(
      `${label} ${Math.round(entry.totalMs)}ms`,
      entry.meta,
    );
    console.table(entry.spans);
    if (entry.extra) {
      console.log('extra', entry.extra);
    }
    console.groupEnd();
    return;
  }
  console.log(label, entry);
}

export function createPerfRecorder(meta: PerfMeta): PerfRecorder | null {
  if (!isPerfTraceEnabled()) {
    return null;
  }
  const start = nowMs();
  const spans: PerfSpan[] = [];

  return {
    async trace<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const spanStart = nowMs();
      try {
        const result = await fn();
        spans.push({
          label,
          durationMs: nowMs() - spanStart,
          status: 'ok',
        });
        return result;
      } catch (error) {
        spans.push({
          label,
          durationMs: nowMs() - spanStart,
          status: 'error',
        });
        throw error;
      }
    },
    commit(extra?: Record<string, unknown>): void {
      const entry: PerfLogEntry = {
        meta,
        spans,
        totalMs: nowMs() - start,
        extra,
        timestamp: new Date().toISOString(),
      };
      pushLog(entry);
    },
  };
}

export function setPerfTraceEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(PERF_TRACE_FLAG_KEY, enabled ? '1' : '0');
  } catch {
    // No operation
  }
}

export async function runPerfSpan<T>(
  recorder: PerfRecorder | null,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!recorder) {
    return fn();
  }
  return recorder.trace(label, fn);
}

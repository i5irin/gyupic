import init, { apply_metadata } from './src/core/metadata/wasm-pkg/metadata_core.js';
import { readFileSync } from 'fs';

const wasmBytes = readFileSync('./src/core/metadata/wasm-pkg/metadata_core_bg.wasm');
await init(wasmBytes);
const encoded = new Uint8Array(readFileSync('tests/sample.webp'));
const captureTime = {
  source: 'exif',
  value: '2024:01:01 12:34:56',
  offsetMinutes: 0,
  timestampMs: Date.now(),
};
const settings = {
  captureTimeEnabled: true,
  captureTime,
  ordering: { sortingAxis: 'exif', needsExif: true, allowEditedTimeFallback: false },
  timestampWriteMode: 'copy-exif',
  rewriteExif: true,
  injectFromEditedTime: false,
  outputFormat: 'webp',
  gpsEnabled: false,
  preserveXmp: false,
  preserveXmpManagement: false,
};
const result = await apply_metadata(encoded, settings);
console.log('warnings', result.warnings);
console.log('applied capture', result.appliedFlags.captureTime);
console.log('badge', result.captureTimeBadge);
console.log('output bytes', result.output.length);

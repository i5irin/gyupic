declare module 'exifr' {
  export type ParseOptions = {
    pick?: string[] | string;
    reviveValues?: boolean;
  };

  export function parse(
    input: Blob | ArrayBuffer | ArrayBufferView | string,
    options?: ParseOptions,
  ): Promise<Record<string, unknown> | null>;
}

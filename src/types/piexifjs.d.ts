declare module 'piexifjs' {
  export type ExifData = {
    '0th'?: Record<number, string | number>;
    Exif?: Record<number, string | number>;
    GPS?: Record<number, string | number>;
    '1st'?: Record<number, string | number>;
    thumbnail?: string | null;
  };

  export function load(data: string): ExifData;
  export function dump(data: ExifData): string;
  export function insert(exif: string, jpegData: string): string;
  export function remove(jpegData: string): string;
}

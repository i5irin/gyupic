import { useCallback, useRef, useState } from 'react';
import ImageFile from './models/image-file';
import ImageFileService from './services/image-file-service';
import FilePicker from './components/FilePicker';
import LoadedList from './components/LoadedList';
import ConvertedList from './components/ConvertedList';
import { LoadedThumbnail, ConvertedThumbnail } from './components/types';

function key(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const [convertSources, setConvertSources] = useState<ImageFile[]>([]);

  const [loadedThumbnails, setLoadedThumbnails] = useState<LoadedThumbnail[]>(
    [],
  );

  const [convertedThumbnails, setConvertedThumbnails] = useState<
    ConvertedThumbnail[]
  >([]);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const onReset = useCallback(() => {
    setLoadedThumbnails([]);
    setConvertSources([]);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, []);

  const onChangeFiles = useCallback(async (files: File[]) => {
    setConvertSources([]);
    const imageFiles = await Promise.all(
      files.map((file) => ImageFileService.load(file)),
    );
    setConvertSources(imageFiles);
    setLoadedThumbnails((prev) => [
      ...prev,
      ...imageFiles.map((img) => ({
        key: key(),
        file: img,
        url: img.getObjectURL(),
      })),
    ]);
  }, []);

  const onConvert = useCallback(() => {
    if (convertSources.length === 0) {
      return;
    }
    convertSources.forEach(async (source) => {
      const converted = await ImageFileService.convertToJpeg(source, 1);
      const url = converted.getObjectURL();
      setConvertedThumbnails((prev) => [
        ...prev,
        { key: key(), file: converted, url },
      ]);
    });
  }, [convertSources]);

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

      {/* Loaded list (current behavior: new loads append to the list instead of replacing it.) */}
      <LoadedList items={loadedThumbnails} />

      {/* Converted list (current behavior: new converts append to the list instead of replacing it.) */}
      <ConvertedList items={convertedThumbnails} />
    </div>
  );
}

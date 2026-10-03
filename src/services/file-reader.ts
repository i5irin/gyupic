export default function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    function loadListener() {
      if (typeof reader.result !== 'string') {
        throw new Error();
      }
      resolve(reader.result);
    }
    function removeListener() {
      reader.removeEventListener('load', loadListener);
      reader.removeEventListener('error', reject);
      reader.removeEventListener('abort', reject);
      reader.removeEventListener('loadend', removeListener);
    }

    reader.addEventListener('load', loadListener);
    reader.addEventListener('error', reject);
    reader.addEventListener('abort', reject);
    reader.addEventListener('loadend', removeListener);

    reader.readAsDataURL(file);
  });
}

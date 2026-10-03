import FileInput from './views/file-input/file-input';
import ResetButton from './views/reset-button';
import ImageFileService from './services/image-file-service';
import LoadImageListItem from './views/load-image-list-item/load-image-list-item';
import LoadImageList from './views/load-image-list/load-image-list';
import ImageFile from './models/image-file';
import ConvertButton from './views/convert-button/convert-button';
import ConvertedImageListItem from './views/converted-image-list-item/converted-image-list-item';
import ConvertedImageList from './views/converted-image-list/converted-image-list';
import './main.css';

const loadImages: ImageFile[] = [];
const resetLoadImages = () =>
  [...Array(loadImages.length)].forEach(() => loadImages.pop());

const div = document.querySelector<HTMLDivElement>('.js-files-input');
if (div === null) {
  throw new Error();
}
const fileInput = FileInput.attach(div);

const resetButtonElement = document.querySelector<HTMLButtonElement>(
  '.js-files-reset-button',
);
if (resetButtonElement === null) {
  throw new Error();
}
const resetButton = ResetButton.attach(resetButtonElement);

const convertButtonElement = document.querySelector<HTMLButtonElement>(
  '.js-files-convert-button',
);
if (convertButtonElement === null) {
  throw new Error();
}
const convertButton = ConvertButton.attach(convertButtonElement);

const loadListElement = document.querySelector<HTMLDivElement>(
  '.js-load-image-list',
);
if (loadListElement === null) {
  throw new Error();
}
const loadList = LoadImageList.attach(loadListElement);

const convertedListElement = document.querySelector<HTMLDivElement>(
  '.js-converted-image-list',
);
if (convertedListElement === null) {
  throw new Error();
}
const convertedList = ConvertedImageList.attach(convertedListElement);

resetButton.on('click', () => {
  loadList.removeAll();
  fileInput.reset();
  resetLoadImages();
});
convertButton.on('click', () => {
  if (loadImages.length === 0) {
    return;
  }
  loadImages.map(async (loadImage) => {
    const convertedImage = await ImageFileService.convertToJpeg(loadImage, 1);
    const convertedListItem = ConvertedImageListItem.create();
    convertedListItem.on('load', () => {
      convertedImage.revokeObjectURL();
    });
    convertedListItem.setImage(convertedImage.getObjectURL());
    convertedList.addImage(convertedListItem);
  });
});
fileInput.on('change', async (files) => {
  // Clear the loaded image list
  resetLoadImages();
  // Load files as images

  await Promise.all(
    files.map(async (file) => {
      const imageFile = await ImageFileService.load(file);
      loadImages.push(imageFile);
      const imageUri = imageFile.getObjectURL();
      const loadListItem = LoadImageListItem.create();
      loadListItem.on('load', () => {
        imageFile.revokeObjectURL();
      });
      loadListItem.setImage(imageUri);
      loadList.addImage(loadListItem);
    }),
  );
});
// Store as a list of loaded images
// Display in the list of loaded images
// If convert button clicked
// Check if loaded image list exists
// If loaded image list exists
// Start conversion to the target format

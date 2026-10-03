import ViewBase from 'views/view-base/view-base';
import {
  root,
  loadImageListItemImage,
} from 'views/load-image-list-item/load-image-list-item.module.css';

type LoadImageListItemEvents = {
  load: () => void;
};

export default class LoadImageListItem extends ViewBase<LoadImageListItemEvents> {
  private constructor(
    readonly rootElement: HTMLDivElement,
    private readonly imgElement: HTMLImageElement,
  ) {
    super();
  }

  static create() {
    const img = document.createElement('img');
    img.classList.add(loadImageListItemImage);
    const container = document.createElement('div');
    container.classList.add(root);
    container.appendChild(img);
    const imageListItem = new LoadImageListItem(container, img);
    LoadImageListItem.wire(imageListItem);
    return imageListItem;
  }

  private static wire(imageListItem: LoadImageListItem) {
    imageListItem.imgElement.addEventListener('load', () => {
      imageListItem.emit('load');
    });
  }

  public setImage(imageUri: string) {
    this.imgElement.src = imageUri;
  }
}

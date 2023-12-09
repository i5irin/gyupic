import ViewBase from 'views/view-base/view-base';
import LoadImageListItem from 'views/load-image-list-item/load-image-list-item';

type LoadImageListEvents = {};

export default class LoadImageList extends ViewBase<LoadImageListEvents> {
  private constructor(readonly rootElement: HTMLDivElement) {
    super();
  }

  public static create() {
    const container = document.createElement('div');
    return new LoadImageList(container);
  }

  static attach(root: HTMLDivElement) {
    const list = new LoadImageList(root);
    return list;
  }

  addImage(item: LoadImageListItem) {
    this.rootElement.appendChild(item.rootElement);
  }

  removeAll() {
    Array.from(this.rootElement.children).forEach((child) =>
      this.rootElement.removeChild(child),
    );
  }
}

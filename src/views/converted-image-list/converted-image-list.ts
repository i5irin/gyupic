import ViewBase from 'views/view-base/view-base';
import ConvertedImageListItem from 'views/converted-image-list-item/converted-image-list-item';

type ConvertedImageListEvents = {};

export default class ConvertedImageList extends ViewBase<ConvertedImageListEvents> {
  private constructor(readonly rootElement: HTMLDivElement) {
    super();
  }

  static create() {
    const container = document.createElement('div');
    return new ConvertedImageList(container);
  }

  static attach(root: HTMLDivElement) {
    const list = new ConvertedImageList(root);
    return list;
  }

  addImage(item: ConvertedImageListItem) {
    this.rootElement.appendChild(item.rootElement);
  }
}

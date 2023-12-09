import ViewBase from 'views/view-base/view-base';

type ConvertedImageListItemEvents = {
  load: () => void;
};

export default class ConvertedImageListItem extends ViewBase<ConvertedImageListItemEvents> {
  private constructor(
    readonly rootElement: HTMLDivElement,
    private readonly imgElement: HTMLImageElement,
  ) {
    super();
  }

  static create() {
    const img = document.createElement('img');
    const container = document.createElement('div');
    container.appendChild(img);
    const imageListItem = new ConvertedImageListItem(container, img);
    ConvertedImageListItem.wire(imageListItem);
    return imageListItem;
  }

  private static wire(imageListItem: ConvertedImageListItem) {
    imageListItem.imgElement.addEventListener('load', () => {
      imageListItem.emit('load');
    });
  }

  public setImage(imageUri: string) {
    this.imgElement.src = imageUri;
  }
}

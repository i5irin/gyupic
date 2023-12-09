import ViewBase from 'views/view-base/view-base';

type ConvertButtonEvents = {
  click: () => void;
};

export default class ConvertButton extends ViewBase<ConvertButtonEvents> {
  private constructor(readonly rootElement: HTMLButtonElement) {
    super();
  }

  static attach(root: HTMLButtonElement) {
    const button = new ConvertButton(root);
    button.rootElement.addEventListener('click', () => {
      button.emit('click');
    });
    return button;
  }
}

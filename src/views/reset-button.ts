import ViewBase from 'views/view-base/view-base';

type ResetButtonEvents = {
  click: () => void;
};

export default class ResetButton extends ViewBase<ResetButtonEvents> {
  private constructor(readonly rootElement: HTMLButtonElement) {
    super();
  }

  static attach(root: HTMLButtonElement) {
    const button = new ResetButton(root);
    button.rootElement.addEventListener('click', () => {
      button.emit('click');
    });
    return button;
  }
}

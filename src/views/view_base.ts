import EventEmitter from 'eventemitter3';

type EventCallbackMap = {
  [key: string]: (...args: any[]) => void;
};

export default abstract class ViewBase<Events extends EventCallbackMap> {
  private emitter: EventEmitter = new EventEmitter();

  abstract get rootElement(): HTMLElement;

  on<Event extends Extract<keyof Events, string>>(
    eventName: Event,
    callback: Events[Event],
  ): void {
    this.emitter.on(eventName, callback);
  }

  off<Event extends Extract<keyof Events, string>>(
    eventName: Event,
    callback?: Events[Event],
  ): void {
    this.emitter.off(eventName, callback);
  }

  protected emit<Event extends Extract<keyof Events, string>>(
    eventName: Event,
    ...args: Parameters<Events[Event]>
  ): void {
    this.emitter.emit(eventName, ...args);
  }
}

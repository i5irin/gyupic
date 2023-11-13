export default function setupCounter(element: HTMLButtonElement) {
  let counter = 0;
  const setCounter = (count: number) => {
    counter = count;
    element.replaceChildren(document.createTextNode(`count is ${counter}`));
  };
  element.addEventListener('click', () => setCounter(counter + 1));
  setCounter(0);
}

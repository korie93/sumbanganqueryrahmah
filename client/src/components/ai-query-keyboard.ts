type QueryKeyEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  nativeEvent: { isComposing: boolean; keyCode?: number };
  preventDefault: () => void;
};

/** Keep normal Enter/newlines and IME composition native to the textarea. */
export function handleAIQueryKeyDown(event: QueryKeyEvent, canSend: boolean, send: () => void) {
  if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey
    || event.repeat || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
  event.preventDefault();
  if (canSend) send();
}

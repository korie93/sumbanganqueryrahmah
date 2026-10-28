import { useCallback, useEffect, useRef, useState } from "react";

type SearchText = { searchTerm: string; uploaderFilter: string };
type TextField = keyof SearchText;
const EMPTY_TEXT: SearchText = { searchTerm: "", uploaderFilter: "" };
const sameText = (left: SearchText, right: SearchText) =>
  left.searchTerm === right.searchTerm && left.uploaderFilter === right.uploaderFilter;
export const SAVED_SEARCH_DEBOUNCE_MS = 300;

/** Debounces the server query while raw text keeps ownership and input immediate. */
export function useSavedSearchQuery(initialText: SearchText = EMPTY_TEXT) {
  const [text, setText] = useState<SearchText>(() => ({ ...initialText }));
  const [submitted, setSubmitted] = useState<SearchText>(() => ({ ...initialText }));
  const [composing, setComposing] = useState({ searchTerm: false, uploaderFilter: false });
  const textRef = useRef(text);
  const submittedRef = useRef(submitted);
  const composingRef = useRef(composing);
  const timerRef = useRef<number | null>(null);

  const clearDebounceTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  // True means the caller may refresh the already-submitted query directly.
  // A newly submitted pair is loaded by the query effect, never an old closure.
  const flush = useCallback(() => {
    clearDebounceTimer();
    if (composingRef.current.searchTerm || composingRef.current.uploaderFilter) return false;
    if (sameText(textRef.current, submittedRef.current)) return true;
    submittedRef.current = textRef.current;
    setSubmitted(textRef.current);
    return false;
  }, [clearDebounceTimer]);

  useEffect(() => {
    clearDebounceTimer();
    if (!composing.searchTerm && !composing.uploaderFilter && !sameText(text, submitted)) {
      timerRef.current = window.setTimeout(() => { flush(); }, SAVED_SEARCH_DEBOUNCE_MS);
    }
    return clearDebounceTimer;
  }, [clearDebounceTimer, composing, flush, submitted, text]);

  const updateText = useCallback((field: TextField, value: string) => {
    if (textRef.current[field] === value) return;
    clearDebounceTimer();
    const next = { ...textRef.current, [field]: value };
    textRef.current = next;
    setText(next);
    if (!value.trim()) flush();
  }, [clearDebounceTimer, flush]);
  const updateComposition = useCallback((field: TextField, value: boolean) => {
    if (composingRef.current[field] === value) return;
    clearDebounceTimer();
    const next = { ...composingRef.current, [field]: value };
    composingRef.current = next;
    setComposing(next);
  }, [clearDebounceTimer]);
  const reset = useCallback(() => {
    clearDebounceTimer();
    textRef.current = EMPTY_TEXT;
    submittedRef.current = EMPTY_TEXT;
    composingRef.current = { searchTerm: false, uploaderFilter: false };
    setText(EMPTY_TEXT);
    setSubmitted(EMPTY_TEXT);
    setComposing(composingRef.current);
  }, [clearDebounceTimer]);

  const setSearchTerm = useCallback((value: string) => updateText("searchTerm", value), [updateText]);
  const setUploaderFilter = useCallback((value: string) => updateText("uploaderFilter", value), [updateText]);
  const setSearchComposing = useCallback((value: boolean) => updateComposition("searchTerm", value), [updateComposition]);
  const setUploaderComposing = useCallback((value: boolean) => updateComposition("uploaderFilter", value), [updateComposition]);
  const queryReady = sameText(text, submitted) && !composing.searchTerm && !composing.uploaderFilter;
  return { ...text, submitted, queryReady, composing: composing.searchTerm || composing.uploaderFilter,
    setSearchTerm, setUploaderFilter, setSearchComposing, setUploaderComposing, flush, reset };
}

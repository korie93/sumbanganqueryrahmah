import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { isNearAIMessageBottom, isReadingEarlierAIMessages } from "./ai-message-follow";
import { bindAIMessageSelectionGuard, type AIMessageSelectionGuard } from "./ai-message-selection-guard";
import { captureAIReadingBookmark, restoreAIReadingBookmark, type AIReadingBookmarkStore } from "./ai-reading-bookmark";

type AIMessageFollowOptions = {
  containerRef: RefObject<HTMLDivElement | null>;
  messages: readonly unknown[];
  streamingText: string;
  activityKey: string;
  readingBookmark?: AIReadingBookmarkStore | undefined;
  isVisible?: boolean | undefined;
};

export function useAIMessageFollow({ containerRef, messages, streamingText, activityKey, readingBookmark, isVisible = true }: AIMessageFollowOptions) {
  const followingRef = useRef(true);
  const lastTopRef = useRef(0);
  const selectionGuardRef = useRef<AIMessageSelectionGuard | null>(null);
  const visibleRef = useRef(isVisible);
  const bookmarkGenerationRef = useRef(readingBookmark?.getGeneration() ?? 0);
  const hasContent = messages.length > 0 || streamingText.length > 0;
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const setFollowing = useCallback((following: boolean) => {
    if (followingRef.current === following) return;
    followingRef.current = following;
    setShowJumpToLatest(!following);
  }, []);

  const saveReadingPosition = useCallback((element: HTMLElement | null) => {
    if (!readingBookmark || !element || !visibleRef.current || !hasContent) return;
    const bookmark = captureAIReadingBookmark(element, followingRef.current);
    if (bookmark) readingBookmark.write(bookmark, bookmarkGenerationRef.current);
  }, [hasContent, readingBookmark]);

  useLayoutEffect(() => {
    const element = containerRef.current;
    visibleRef.current = isVisible;
    if (!readingBookmark || !element || !isVisible) return;
    bookmarkGenerationRef.current = readingBookmark.getGeneration();
    const bookmark = readingBookmark.read();
    if (bookmark) {
      setFollowing(bookmark.followLatest);
      const top = restoreAIReadingBookmark(element, bookmark);
      if (top !== null) lastTopRef.current = top;
    } else {
      setFollowing(true);
    }
    return () => {
      // Keep the last valid visible snapshot when a hidden or removed log has
      // no geometry. Reset generations reject cleanup from an older session.
      saveReadingPosition(element);
      visibleRef.current = false;
    };
  }, [containerRef, isVisible, readingBookmark, saveReadingPosition, setFollowing]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const guard = bindAIMessageSelectionGuard(element, () => setFollowing(false));
    selectionGuardRef.current = guard;
    return () => {
      guard.dispose();
      if (selectionGuardRef.current === guard) selectionGuardRef.current = null;
    };
  }, [containerRef, setFollowing]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onScroll = () => {
      if (!visibleRef.current) return;
      if (selectionGuardRef.current?.isPaused()) {
        lastTopRef.current = element.scrollTop;
        saveReadingPosition(element);
        return;
      }
      if (isNearAIMessageBottom(element)) setFollowing(true);
      else if (isReadingEarlierAIMessages(element, lastTopRef.current)) setFollowing(false);
      lastTopRef.current = element.scrollTop;
      saveReadingPosition(element);
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [containerRef, saveReadingPosition, setFollowing]);

  const scrollToLatest = useCallback(() => {
    const element = containerRef.current;
    if (!visibleRef.current || !element || selectionGuardRef.current?.isPaused()) return;
    element.scrollTop = element.scrollHeight;
    lastTopRef.current = element.scrollTop;
    saveReadingPosition(element);
  }, [containerRef, saveReadingPosition]);

  const jumpToLatest = useCallback(() => {
    selectionGuardRef.current?.resume();
    setFollowing(true);
    scrollToLatest();
  }, [scrollToLatest, setFollowing]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      // Keyboard/rotation changes the log's height without changing messages.
      // Readers who scrolled back retain their position and the jump control.
      if (visibleRef.current && followingRef.current) scrollToLatest();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef, scrollToLatest]);

  useEffect(() => {
    if (messages.length === 0 && !streamingText) {
      bookmarkGenerationRef.current = readingBookmark?.getGeneration() ?? 0;
      selectionGuardRef.current?.reset();
      setFollowing(true);
    }
    if (visibleRef.current && followingRef.current) scrollToLatest();
  }, [activityKey, messages, readingBookmark, scrollToLatest, setFollowing, streamingText]);

  return { jumpToLatest, showJumpToLatest };
}

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { isNearAIMessageBottom, isReadingEarlierAIMessages } from "./ai-message-follow";

type AIMessageFollowOptions = {
  containerRef: RefObject<HTMLDivElement | null>;
  messages: readonly unknown[];
  streamingText: string;
  activityKey: string;
};

export function useAIMessageFollow({ containerRef, messages, streamingText, activityKey }: AIMessageFollowOptions) {
  const followingRef = useRef(true);
  const lastTopRef = useRef(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const setFollowing = useCallback((following: boolean) => {
    if (followingRef.current === following) return;
    followingRef.current = following;
    setShowJumpToLatest(!following);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onScroll = () => {
      if (isNearAIMessageBottom(element)) setFollowing(true);
      else if (isReadingEarlierAIMessages(element, lastTopRef.current)) setFollowing(false);
      lastTopRef.current = element.scrollTop;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [containerRef, setFollowing]);

  const jumpToLatest = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    setFollowing(true);
    element.scrollTop = element.scrollHeight;
    lastTopRef.current = element.scrollTop;
  }, [containerRef, setFollowing]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      // Keyboard/rotation changes the log's height without changing messages.
      // Readers who scrolled back retain their position and the jump control.
      if (followingRef.current) jumpToLatest();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef, jumpToLatest]);

  useEffect(() => {
    if (messages.length === 0 && !streamingText) setFollowing(true);
    if (followingRef.current) jumpToLatest();
  }, [activityKey, jumpToLatest, messages, setFollowing, streamingText]);

  return { jumpToLatest, showJumpToLatest };
}

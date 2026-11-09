export type AIReadingBookmark = {
  followLatest: boolean;
  scrollTop: number;
  anchorId: string | null;
  anchorOffset: number;
};

export type AIReadingBookmarkStore = {
  read: () => AIReadingBookmark | null;
  write: (bookmark: AIReadingBookmark, generation: number) => boolean;
  clear: () => void;
  getGeneration: () => number;
};

const MAX_BOOKMARK_ID_LENGTH = 256;
const MAX_BOOKMARK_ARTICLES = 30;

function copyValidBookmark(bookmark: AIReadingBookmark): AIReadingBookmark | null {
  if (typeof bookmark.followLatest !== "boolean" || !Number.isFinite(bookmark.scrollTop)
    || bookmark.scrollTop < 0 || !Number.isFinite(bookmark.anchorOffset)) return null;
  const anchorId = typeof bookmark.anchorId === "string" && bookmark.anchorId.length > 0
    && bookmark.anchorId.length <= MAX_BOOKMARK_ID_LENGTH ? bookmark.anchorId : null;
  return {
    followLatest: bookmark.followLatest,
    scrollTop: bookmark.scrollTop,
    anchorId,
    anchorOffset: anchorId === null ? 0 : bookmark.anchorOffset,
  };
}

/** Keeps one small bookmark in the owning provider; reset invalidates stale cleanup writes. */
export function createAIReadingBookmarkStore(): AIReadingBookmarkStore {
  let bookmark: AIReadingBookmark | null = null;
  let generation = 0;
  return {
    read: () => bookmark ? { ...bookmark } : null,
    write: (next, capturedGeneration) => {
      if (capturedGeneration !== generation) return false;
      const valid = copyValidBookmark(next);
      if (!valid) return false;
      bookmark = valid;
      return true;
    },
    clear: () => { bookmark = null; generation++; },
    getGeneration: () => generation,
  };
}

function getLogViewportTop(element: HTMLElement) {
  return element.getBoundingClientRect().top + element.clientTop;
}

/** Captures position and a stable visible message ID without retaining text or DOM nodes. */
export function captureAIReadingBookmark(element: HTMLElement, followLatest: boolean): AIReadingBookmark | null {
  if (!element.isConnected || element.clientHeight <= 0 || !Number.isFinite(element.scrollTop)) return null;
  const bookmark: AIReadingBookmark = {
    followLatest, scrollTop: Math.max(0, element.scrollTop), anchorId: null, anchorOffset: 0,
  };
  if (followLatest) return bookmark;
  const top = getLogViewportTop(element);
  const bottom = top + element.clientHeight;
  const articles = element.querySelectorAll<HTMLElement>("[data-ai-message-id]");
  for (let index = 0; index < Math.min(articles.length, MAX_BOOKMARK_ARTICLES); index++) {
    const article = articles[index]!;
    const id = article.getAttribute("data-ai-message-id");
    const rect = article.getBoundingClientRect();
    if (!id || id.length > MAX_BOOKMARK_ID_LENGTH || rect.bottom <= top || rect.top >= bottom) continue;
    bookmark.anchorId = id;
    bookmark.anchorOffset = rect.top - top;
    break;
  }
  return copyValidBookmark(bookmark);
}

/** Restores a bounded log position, falling back to retained history when its anchor was evicted. */
export function restoreAIReadingBookmark(element: HTMLElement, bookmark: AIReadingBookmark): number | null {
  if (!element.isConnected || element.clientHeight <= 0) return null;
  const valid = copyValidBookmark(bookmark);
  if (!valid) return null;
  const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
  let target = valid.followLatest ? maxTop : valid.scrollTop;
  if (!valid.followLatest && valid.anchorId !== null) {
    const articles = element.querySelectorAll<HTMLElement>("[data-ai-message-id]");
    target = 0;
    for (let index = 0; index < Math.min(articles.length, MAX_BOOKMARK_ARTICLES); index++) {
      const article = articles[index]!;
      if (article.getAttribute("data-ai-message-id") !== valid.anchorId) continue;
      target = element.scrollTop + article.getBoundingClientRect().top - getLogViewportTop(element) - valid.anchorOffset;
      break;
    }
  }
  if (!Number.isFinite(target)) return null;
  element.scrollTop = Math.min(maxTop, Math.max(0, target));
  return element.scrollTop;
}

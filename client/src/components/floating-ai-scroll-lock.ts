type StyleLike = {
  overflow: string;
  overscrollBehavior: string;
};

type FloatingAiScrollLockTarget = {
  bodyStyle: StyleLike;
  documentElementStyle: StyleLike;
};

export function applyFloatingAiScrollLock(target: FloatingAiScrollLockTarget) {
  const previousBodyOverflow = target.bodyStyle.overflow;
  const previousDocumentOverscrollBehavior = target.documentElementStyle.overscrollBehavior;
  let restored = false;

  target.bodyStyle.overflow = "hidden";
  target.documentElementStyle.overscrollBehavior = "none";

  return () => {
    if (restored) return;
    restored = true;
    target.bodyStyle.overflow = previousBodyOverflow;
    target.documentElementStyle.overscrollBehavior = previousDocumentOverscrollBehavior;
  };
}

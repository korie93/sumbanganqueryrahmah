type StyleLike = {
  overflow: string;
  overscrollBehavior: string;
  position?: string | undefined;
  top?: string | undefined;
  left?: string | undefined;
  right?: string | undefined;
  width?: string | undefined;
};

type FloatingAiScrollLockTarget = {
  bodyStyle: StyleLike;
  documentElementStyle: StyleLike;
  windowObject?: {
    scrollY: number;
    scrollTo: (x: number, y: number) => void;
  };
};

export function applyFloatingAiScrollLock(target: FloatingAiScrollLockTarget) {
  const previousBodyOverflow = target.bodyStyle.overflow;
  const previousBodyPosition = target.bodyStyle.position;
  const previousBodyTop = target.bodyStyle.top;
  const previousBodyLeft = target.bodyStyle.left;
  const previousBodyRight = target.bodyStyle.right;
  const previousBodyWidth = target.bodyStyle.width;
  const previousDocumentOverflow = target.documentElementStyle.overflow;
  const previousDocumentOverscrollBehavior = target.documentElementStyle.overscrollBehavior;
  const lockedScrollY = target.windowObject?.scrollY ?? 0;
  let restored = false;

  target.bodyStyle.overflow = "hidden";
  target.bodyStyle.position = "fixed";
  target.bodyStyle.top = `-${lockedScrollY}px`;
  target.bodyStyle.left = "0";
  target.bodyStyle.right = "0";
  target.bodyStyle.width = "100%";
  target.documentElementStyle.overflow = "hidden";
  target.documentElementStyle.overscrollBehavior = "none";

  return () => {
    if (restored) return;
    restored = true;
    target.bodyStyle.overflow = previousBodyOverflow;
    target.bodyStyle.position = previousBodyPosition;
    target.bodyStyle.top = previousBodyTop;
    target.bodyStyle.left = previousBodyLeft;
    target.bodyStyle.right = previousBodyRight;
    target.bodyStyle.width = previousBodyWidth;
    target.documentElementStyle.overflow = previousDocumentOverflow;
    target.documentElementStyle.overscrollBehavior = previousDocumentOverscrollBehavior;
    target.windowObject?.scrollTo(0, lockedScrollY);
  };
}

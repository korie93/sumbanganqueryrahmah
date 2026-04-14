import {
  memo,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { applyViewerVirtualRowStyle } from "@/pages/viewer/viewer-virtual-row-style";
import styles from "./ViewerDataTable.module.css";

type PositionedRowShellProps = {
  positionStyle: CSSProperties;
  children: ReactNode;
};

export const PositionedRowShell = memo(function PositionedRowShell({
  positionStyle,
  children,
}: PositionedRowShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const node = shellRef.current;
    if (!node) return;
    applyViewerVirtualRowStyle(node.style, positionStyle);
  }, [positionStyle]);

  return <div ref={shellRef}>{children}</div>;
});

type ViewerGridShellProps = {
  ariaLabel?: string;
  gridTemplateColumns: string;
  className: string;
  children: ReactNode;
};

export const ViewerGridShell = memo(function ViewerGridShell({
  ariaLabel,
  gridTemplateColumns,
  className,
  children,
}: ViewerGridShellProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    gridRef.current?.style.setProperty("--viewer-grid-template-columns", gridTemplateColumns);
  }, [gridTemplateColumns]);

  return (
    <div
      ref={gridRef}
      aria-label={ariaLabel}
      className={`${styles.viewerGrid} ${className}`}
      role="group"
    >
      {children}
    </div>
  );
});

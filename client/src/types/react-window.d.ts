declare module "react-window" {
  import * as React from "react";

  export interface ListChildComponentProps<T = unknown> {
    index: number;
    style: React.CSSProperties;
    data: T;
    isScrolling?: boolean;
  }

  export interface FixedSizeListProps<T = unknown> {
    children: React.ComponentType<ListChildComponentProps<T>> | ((props: ListChildComponentProps<T>) => React.ReactNode);
    className?: string;
    height: number | string;
    width: number | string;
    itemCount: number;
    itemSize: number;
    itemData: T;
    overscanCount?: number;
    initialScrollOffset?: number;
    layout?: "horizontal" | "vertical";
  }

  export class FixedSizeList<T = unknown> extends React.Component<FixedSizeListProps<T>> {}
}

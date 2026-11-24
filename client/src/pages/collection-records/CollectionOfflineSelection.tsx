import { lazy, Suspense, useMemo, useReducer, type ReactNode } from "react";
import { CollectionSelectionContext } from "./CollectionSelectionCheckbox";
import { emptyOfflineSelection, updateOfflineSelection } from "./collection-offline-selection";
import type { ViewCollectionReceipt } from "./types";

const ExportControls = lazy(() => import("./CollectionOfflineExportControls"));
type WorkspaceProps = { children: ReactNode; onViewReceipt: ViewCollectionReceipt };

export function CollectionOfflineSelection({ role, ...props }: WorkspaceProps & { role: string }) {
  return role === "superuser" ? <SuperuserSelection {...props} /> : <>{props.children}</>;
}

function SuperuserSelection({ children, onViewReceipt }: WorkspaceProps) {
  const [state, dispatch] = useReducer(updateOfflineSelection, undefined, emptyOfflineSelection);
  const selection = useMemo(() => ({ state, dispatch }), [state]);
  return (
    <CollectionSelectionContext.Provider value={selection}>
      <Suspense fallback={<div aria-hidden="true" className="min-h-14" />}>
        <ExportControls selection={selection} onViewReceipt={onViewReceipt} />
      </Suspense>
      {children}
    </CollectionSelectionContext.Provider>
  );
}

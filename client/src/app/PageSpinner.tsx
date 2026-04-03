import "./app-shell-bootstrap.css";

type PageSpinnerProps = {
  fullscreen?: boolean;
};

export function PageSpinner({ fullscreen = false }: PageSpinnerProps) {
  return (
    <div
      className={`page-spinner-shell ${fullscreen ? "page-spinner-shell--fullscreen" : "page-spinner-shell--app"}`}
    >
      <div className="page-spinner-shell__indicator" />
    </div>
  );
}

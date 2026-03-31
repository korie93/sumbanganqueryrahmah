type PageSpinnerProps = {
  fullscreen?: boolean;
};

export function PageSpinner({ fullscreen = false }: PageSpinnerProps) {
  return (
    <div
      className={`${fullscreen ? "viewport-min-height" : "app-shell-min-height"} flex items-center justify-center bg-background`}
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
    </div>
  );
}

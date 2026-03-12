type PageSpinnerProps = {
  fullscreen?: boolean;
};

export function PageSpinner({ fullscreen = false }: PageSpinnerProps) {
  return (
    <div
      className={`${fullscreen ? "min-h-screen" : "min-h-[calc(100vh-3.5rem)]"} flex items-center justify-center bg-background`}
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
    </div>
  );
}

export type CarouselSelectionEvent = "reInit" | "select"

export type CarouselSelectionEventApi<TApi> = {
  on: (event: CarouselSelectionEvent, callback: (api: TApi) => void) => void
  off: (event: CarouselSelectionEvent, callback: (api: TApi) => void) => void
}

export function bindCarouselSelectionEvents<TApi extends CarouselSelectionEventApi<TApi>>(
  api: TApi | undefined,
  onSelect: (api: TApi) => void
) {
  if (!api) {
    return () => undefined
  }

  onSelect(api)
  api.on("reInit", onSelect)
  api.on("select", onSelect)

  return () => {
    api.off("reInit", onSelect)
    api.off("select", onSelect)
  }
}

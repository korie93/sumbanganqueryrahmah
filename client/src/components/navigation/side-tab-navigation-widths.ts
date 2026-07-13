const sideTabWidthClassByPixels = new Map<number, string>([
  [84, "w-[84px]"],
  [88, "w-[88px]"],
  [276, "w-[276px]"],
  [296, "w-[296px]"],
  [308, "w-[308px]"],
]);

export function resolveSideTabWidthClass(width: number, fallbackClassName: string) {
  return sideTabWidthClassByPixels.get(width) ?? fallbackClassName;
}

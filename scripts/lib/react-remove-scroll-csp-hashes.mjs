import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const DEFAULT_MAX_SCROLLBAR_GAP_PX = 30;

function readDependencyFile(path) {
  return readFileSync(require.resolve(path), "utf8");
}

function readExportedString(source, name) {
  const match = source.match(new RegExp(`export const ${name} = ['"]([^'"]+)['"]`));
  if (!match?.[1]) {
    throw new Error(`Unable to find ${name} in react-remove-scroll-bar dependency source.`);
  }
  return match[1];
}

export function readReactRemoveScrollBarMetadata() {
  const packageJson = JSON.parse(readDependencyFile("react-remove-scroll-bar/package.json"));
  const constantsSource = readDependencyFile("react-remove-scroll-bar/dist/es2019/constants.js");
  const componentSource = readDependencyFile("react-remove-scroll-bar/dist/es2019/component.js");

  return {
    fullWidthClassName: readExportedString(constantsSource, "fullWidthClassName"),
    lockAttribute: readExportedString(componentSource, "lockAttribute"),
    noScrollbarsClassName: readExportedString(constantsSource, "noScrollbarsClassName"),
    removedBarSizeVariable: readExportedString(constantsSource, "removedBarSizeVariable"),
    version: String(packageJson.version || "unknown"),
    zeroRightClassName: readExportedString(constantsSource, "zeroRightClassName"),
  };
}

function buildReactRemoveScrollBarStyle({
  allowRelative,
  fullWidthClassName,
  gap,
  gapMode,
  important,
  left,
  lockAttribute,
  noScrollbarsClassName,
  removedBarSizeVariable,
  right,
  top,
  zeroRightClassName,
}) {
  const bodyOffsetStyles = [
    allowRelative && `position: relative ${important};`,
    gapMode === "margin" &&
      `
    padding-left: ${left}px;
    padding-top: ${top}px;
    padding-right: ${right}px;
    margin-left:0;
    margin-top:0;
    margin-right: ${gap}px ${important};
    `,
    gapMode === "padding" && `padding-right: ${gap}px ${important};`,
  ]
    .filter(Boolean)
    .join("");

  return `
  .${noScrollbarsClassName} {
   overflow: hidden ${important};
   padding-right: ${gap}px ${important};
  }
  body[${lockAttribute}] {
    overflow: hidden ${important};
    overscroll-behavior: contain;
    ${bodyOffsetStyles}
  }
  
  .${zeroRightClassName} {
    right: ${gap}px ${important};
  }
  
  .${fullWidthClassName} {
    margin-right: ${gap}px ${important};
  }
  
  .${zeroRightClassName} .${zeroRightClassName} {
    right: 0 ${important};
  }
  
  .${fullWidthClassName} .${fullWidthClassName} {
    margin-right: 0 ${important};
  }
  
  body[${lockAttribute}] {
    ${removedBarSizeVariable}: ${gap}px;
  }
`;
}

export function generateReactRemoveScrollBarStyleHashes(options = {}) {
  const maxGapPx = Math.max(
    0,
    Math.trunc(Number(options.maxGapPx ?? DEFAULT_MAX_SCROLLBAR_GAP_PX)),
  );
  const metadata = readReactRemoveScrollBarMetadata();
  const hashes = [];

  for (let gap = 0; gap <= maxGapPx; gap += 1) {
    const style = buildReactRemoveScrollBarStyle({
      ...metadata,
      allowRelative: true,
      gap,
      gapMode: "margin",
      important: "!important",
      left: 0,
      right: 0,
      top: 0,
    });
    hashes.push(`'sha256-${createHash("sha256").update(style).digest("base64")}'`);
  }

  return {
    hashes,
    maxGapPx,
    version: metadata.version,
  };
}

export function formatCspHashArray(hashes) {
  return hashes.map((hash) => `  "${hash}",`).join("\n");
}

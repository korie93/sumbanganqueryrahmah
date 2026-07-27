import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function installCallableMinimatchFor(pluginName) {
  const pluginEntry = require.resolve(pluginName);
  const pluginRequire = createRequire(pluginEntry);
  const minimatchPath = pluginRequire.resolve("minimatch");
  const modernMinimatch = pluginRequire("minimatch");

  if (typeof modernMinimatch === "function") {
    return;
  }

  if (typeof modernMinimatch?.minimatch !== "function") {
    throw new TypeError(`${pluginName} resolved an unsupported minimatch API.`);
  }

  const callableMinimatch = Object.assign(
    (path, pattern, options) => modernMinimatch.minimatch(path, pattern, options),
    modernMinimatch,
  );
  const cacheEntry = require.cache[minimatchPath];

  if (!cacheEntry) {
    throw new Error(`Unable to install minimatch compatibility for ${pluginName}.`);
  }

  cacheEntry.exports = callableMinimatch;
}

installCallableMinimatchFor("eslint-plugin-jsx-a11y");
const jsxA11y = require("eslint-plugin-jsx-a11y");

installCallableMinimatchFor("eslint-plugin-react");
const react = require("eslint-plugin-react");

export { jsxA11y, react };

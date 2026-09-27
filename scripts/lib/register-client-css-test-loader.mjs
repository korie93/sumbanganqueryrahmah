import { registerHooks } from "node:module";

// Node component-render tests do not execute styles. The built-browser suite
// separately verifies real CSS, layout, focus and interaction behavior.
registerHooks({
  load(url, context, nextLoad) {
    if (new URL(url).pathname.endsWith(".css")) {
      return { format: "module", source: "export default {};", shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

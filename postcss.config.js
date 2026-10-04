import tailwindcss from "@tailwindcss/postcss";
import tailwindPostcssCompatibility from "./scripts/lib/tailwind-postcss-compat.mjs";

export default {
  // Vite performs the final CSS optimization using our supported browser floor.
  // Avoid Tailwind's earlier, more conservative pass expanding color fallbacks
  // that are not needed by the browsers declared in package.json.
  plugins: [tailwindcss({ optimize: false }), tailwindPostcssCompatibility()],
};

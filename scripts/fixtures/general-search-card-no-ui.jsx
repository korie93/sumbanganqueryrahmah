// Real GeneralSearch page and styles; the browser runner supplies synthetic HTTP.
// No application server, accounts, database, .env or production data are used.
import React from "react";
import { createRoot } from "react-dom/client";
import GeneralSearch from "../../client/src/pages/GeneralSearch";
import "../../client/src/styles/tokens/index.css";
import "../../client/src/public-shell.css";
import "../../client/src/styles/theme/index.css";
import "../../client/src/index.css";

const parameters = new URLSearchParams(location.search);
document.documentElement.classList.toggle("dark", parameters.get("theme") === "dark");
createRoot(document.getElementById("root")).render(
  <GeneralSearch userRole={parameters.get("role") || "admin"} searchResultLimit={200} />,
);

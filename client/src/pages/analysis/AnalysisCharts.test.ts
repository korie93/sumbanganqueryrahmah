import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisCharts } from "@/pages/analysis/AnalysisCharts";

test("AnalysisCharts renders hidden accessible summaries alongside charts", () => {
  const markup = renderToStaticMarkup(
    createElement(AnalysisCharts, {
      categoryBarData: [
        { name: "IC", count: 10, fill: "#3b82f6" },
        { name: "Passport", count: 2, fill: "#9333ea" },
      ],
      genderPieData: [
        { name: "Male", value: 7, color: "#3b82f6" },
        { name: "Female", value: 5, color: "#ec4899" },
      ],
    }),
  );

  assert.match(markup, /Gender Distribution summary/i);
  assert.match(markup, /ID Category Distribution summary/i);
});

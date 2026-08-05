import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const submitStateSource = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/collection/useSaveCollectionSubmitState.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

test("save collection submit skips UI side effects after unmount", () => {
  const successGuardIndex = submitStateSource.indexOf(
    [
      "if (!mountedRef.current) {",
      "        resetSubmitMutationIntent();",
      "        return;",
      "      }",
    ].join("\n"),
  );
  const successToastIndex = submitStateSource.indexOf("mutationFeedback.notifyMutationSuccess");
  const clearPageStateIndex = submitStateSource.indexOf("clearPageState();");

  assert.notEqual(successGuardIndex, -1);
  assert.ok(successGuardIndex < successToastIndex);
  assert.ok(successGuardIndex < clearPageStateIndex);
});

test("save collection submit skips failure toast after unmount", () => {
  const catchGuardIndex = submitStateSource.indexOf(
    [
      "} catch (error: unknown) {",
      "      if (!mountedRef.current) {",
      "        return;",
      "      }",
    ].join("\n"),
  );
  const failureToastIndex = submitStateSource.indexOf(
    "mutationFeedback.notifyMutationError",
    catchGuardIndex,
  );

  assert.notEqual(catchGuardIndex, -1);
  assert.notEqual(failureToastIndex, -1);
  assert.ok(catchGuardIndex < failureToastIndex);
});

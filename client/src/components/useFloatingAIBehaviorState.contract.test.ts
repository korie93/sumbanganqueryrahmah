import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readBehaviorHookSource() {
  return readFileSync(path.resolve(__dirname, "useFloatingAIBehaviorState.ts"), "utf8");
}

test("useFloatingAIBehaviorState updates assistant count snapshots before unread state changes", () => {
  const source = readBehaviorHookSource();
  const snapshotIndex = source.indexOf("const assistantCountSnapshot = assistantCount;");
  const previousIndex = source.indexOf("const previousAssistantCount = lastAssistantCountRef.current;");
  const refUpdateIndex = source.indexOf("lastAssistantCountRef.current = assistantCountSnapshot;");
  const unreadUpdateIndex = source.indexOf("setUnreadCount((previous) => previous + (assistantCountSnapshot - previousAssistantCount));");

  assert.notEqual(snapshotIndex, -1);
  assert.notEqual(previousIndex, -1);
  assert.notEqual(refUpdateIndex, -1);
  assert.notEqual(unreadUpdateIndex, -1);
  assert.ok(snapshotIndex < previousIndex);
  assert.ok(previousIndex < refUpdateIndex);
  assert.ok(refUpdateIndex < unreadUpdateIndex);
  assert.doesNotMatch(source, /lastAssistantCountRef\.current = assistantCount;\s*}\s*, \[assistantCount, isOpen, setUnreadCount\]\);/);
});

test("useFloatingAIBehaviorState guards exported state setters after unmount", () => {
  const source = readBehaviorHookSource();

  assert.match(source, /const isMountedRef = useRef\(true\);/);
  assert.match(source, /isMountedRef\.current = true;[\s\S]*return \(\) => \{[\s\S]*isMountedRef\.current = false;[\s\S]*cancelAISearchRef\.current = null;/);
  assert.match(source, /const setIsOpenIfMounted = useCallback\(\(value: SetStateAction<boolean>\) => \{[\s\S]*if \(!isMountedRef\.current\) \{[\s\S]*return;[\s\S]*setIsOpen\(value\);/);
  assert.match(source, /const setAiStatusIfMounted = useCallback\(\(status: AIChatStatus\) => \{[\s\S]*if \(!isMountedRef\.current\) \{[\s\S]*return;[\s\S]*setAiStatus\(status\);/);
  assert.match(source, /const handleToggle = useCallback\(\(\) => \{[\s\S]*if \(!isMountedRef\.current\) \{[\s\S]*return;[\s\S]*setHasActivated\(true\);[\s\S]*setIsOpenIfMounted\(\(previous\) => !previous\);/);
  assert.match(source, /setIsOpen: setIsOpenIfMounted/);
  assert.match(source, /setAiStatus: setAiStatusIfMounted/);
});

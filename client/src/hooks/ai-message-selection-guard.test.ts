import assert from "node:assert/strict";
import test from "node:test";
import { bindAIMessageSelectionGuard } from "./ai-message-selection-guard";

function createSelectionFixture() {
  const listeners = new Set<() => void>();
  const anchor = {} as Node;
  const focus = {} as Node;
  let selection: Selection | null = null;
  let nativeWrites = 0;
  let passive = false;
  const nativeWrite = () => { nativeWrites++; throw new Error("Native selection must remain untouched"); };
  const ownerDocument = {
    getSelection: () => selection,
    addEventListener: (name: string, listener: () => void, options: AddEventListenerOptions) => {
      assert.equal(name, "selectionchange");
      passive = options.passive === true;
      listeners.add(listener);
    },
    removeEventListener: (name: string, listener: () => void) => {
      assert.equal(name, "selectionchange");
      listeners.delete(listener);
    },
  };
  const element = { isConnected: true, ownerDocument } as unknown as HTMLElement;
  return {
    element,
    emit: () => listeners.forEach((listener) => listener()),
    clear: () => { selection = null; },
    select: (ranges: readonly (boolean | "detached")[], options: { collapsed?: boolean; anchorOffset?: number; focusOffset?: number } = {}) => {
      selection = {
        anchorNode: anchor,
        anchorOffset: options.anchorOffset ?? 0,
        focusNode: focus,
        focusOffset: options.focusOffset ?? 12,
        isCollapsed: options.collapsed ?? false,
        rangeCount: ranges.length,
        getRangeAt: (index: number) => ({
          intersectsNode: (node: Node) => {
            assert.equal(node, element);
            if (ranges[index] === "detached") throw new Error("Detached range");
            return ranges[index] === true;
          },
          deleteContents: nativeWrite,
          collapse: nativeWrite,
        }),
        removeAllRanges: nativeWrite,
        collapse: nativeWrite,
        setPosition: nativeWrite,
        toString: () => { throw new Error("Selection text must not be copied or scanned"); },
      } as unknown as Selection;
      return selection;
    },
    get selection() { return selection; },
    get listenerCount() { return listeners.size; },
    get passive() { return passive; },
    get nativeWrites() { return nativeWrites; },
  };
}

test("existing native log selection pauses once and leaves all selection operations native", () => {
  const fixture = createSelectionFixture();
  const selected = fixture.select([true], { focusOffset: 17 });
  let pauses = 0;
  const guard = bindAIMessageSelectionGuard(fixture.element, () => { pauses++; });
  assert.equal(pauses, 1);
  assert.equal(guard.isPaused(), true);
  fixture.emit(); fixture.emit();
  assert.equal(pauses, 1);
  assert.equal(fixture.selection, selected);
  assert.equal(fixture.nativeWrites, 0);
  assert.equal(fixture.passive, true);
  assert.equal(fixture.listenerCount, 1);
  guard.dispose();
});

test("collapsed, absent and outside selections never pause, while a crossing range does", () => {
  const fixture = createSelectionFixture();
  let pauses = 0;
  const guard = bindAIMessageSelectionGuard(fixture.element, () => { pauses++; });
  assert.equal(guard.isPaused(), false);
  fixture.select([true], { collapsed: true }); fixture.emit();
  assert.equal(guard.isPaused(), false);
  fixture.select([]); fixture.emit();
  assert.equal(guard.isPaused(), false);
  fixture.select([false]); fixture.emit();
  assert.equal(guard.isPaused(), false);
  assert.equal(pauses, 0);
  // Both endpoints may be outside the log while a later range crosses it.
  fixture.select([false, true]); fixture.emit();
  assert.equal(guard.isPaused(), true);
  assert.equal(pauses, 1);
  guard.dispose();
});

test("clearing or moving selection outside releases the guard without resuming the reader", () => {
  const fixture = createSelectionFixture();
  let following = true;
  const guard = bindAIMessageSelectionGuard(fixture.element, () => { following = false; });
  fixture.select([true]); fixture.emit();
  assert.equal(following, false);
  fixture.clear(); fixture.emit();
  assert.equal(guard.isPaused(), false);
  assert.equal(following, false);
  fixture.select([true]); fixture.emit();
  fixture.select([false]); fixture.emit();
  assert.equal(guard.isPaused(), false);
  assert.equal(following, false);
  assert.equal(fixture.nativeWrites, 0);
  guard.dispose();
});

test("explicit jump resumes with unchanged keyboard selection until its endpoints change", () => {
  const fixture = createSelectionFixture();
  let following = true;
  let pauses = 0;
  const guard = bindAIMessageSelectionGuard(fixture.element, () => { following = false; pauses++; });
  const selected = fixture.select([true], { anchorOffset: 2, focusOffset: 15 }); fixture.emit();
  assert.equal(following, false);
  guard.resume(); following = true;
  fixture.emit(); fixture.emit();
  assert.equal(guard.isPaused(), false);
  assert.equal(following, true);
  assert.equal(fixture.selection, selected);
  assert.equal(pauses, 1);
  // A new Shift+Arrow selection gesture must protect the reader again.
  fixture.select([true], { anchorOffset: 2, focusOffset: 16 }); fixture.emit();
  assert.equal(guard.isPaused(), true);
  assert.equal(following, false);
  assert.equal(pauses, 2);
  guard.dispose();
});

test("selection disappearance and session reset discard the manual-resume exemption", () => {
  const fixture = createSelectionFixture();
  let pauses = 0;
  const guard = bindAIMessageSelectionGuard(fixture.element, () => { pauses++; });
  fixture.select([true]); fixture.emit();
  guard.resume();
  fixture.clear(); fixture.emit();
  fixture.select([true]); fixture.emit();
  assert.equal(pauses, 2, "The same endpoints selected later are a new reading gesture");
  guard.resume();
  guard.reset();
  assert.equal(guard.isPaused(), true);
  assert.equal(pauses, 3, "Reset must not retain endpoint references or a prior exemption");
  fixture.clear(); guard.reset();
  assert.equal(guard.isPaused(), false);
  guard.dispose();
});

test("detached native ranges and removed logs are ignored without disturbing later valid ranges", () => {
  const fixture = createSelectionFixture();
  let pauses = 0;
  const guard = bindAIMessageSelectionGuard(fixture.element, () => { pauses++; });
  fixture.select(["detached"]); fixture.emit();
  assert.equal(guard.isPaused(), false);
  fixture.select(["detached", true]); fixture.emit();
  assert.equal(guard.isPaused(), true);
  assert.equal(pauses, 1);
  Object.defineProperty(fixture.element, "isConnected", { value: false });
  fixture.emit();
  assert.equal(guard.isPaused(), false);
  assert.equal(fixture.nativeWrites, 0);
  guard.dispose();
});

test("dispose removes the selection listener and makes stale guard calls inert", () => {
  const fixture = createSelectionFixture();
  let pauses = 0;
  const guard = bindAIMessageSelectionGuard(fixture.element, () => { pauses++; });
  fixture.select([true]); fixture.emit(); guard.resume();
  const selected = fixture.selection;
  guard.dispose(); guard.dispose();
  assert.equal(fixture.listenerCount, 0);
  fixture.emit(); guard.resume(); guard.reset();
  assert.equal(guard.isPaused(), false);
  assert.equal(pauses, 1);
  assert.equal(fixture.selection, selected);
  assert.equal(fixture.nativeWrites, 0);
});

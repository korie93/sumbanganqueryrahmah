import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SaveCollectionReadySummary } from "../SaveCollectionReadySummary";
import {
  focusSaveCollectionField,
  getSaveCollectionFieldTarget,
  SAVE_COLLECTION_FIELD_TARGETS,
} from "../save-collection-field-navigation";
import {
  getSaveCollectionReadiness,
  type SaveCollectionFieldName,
  type SaveCollectionFormValues,
} from "../save-collection-page-utils";

type ElementProps = {
  children?: ReactNode;
  type?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-controls"?: string;
  onClick?: () => void;
};

function descendants(element: ReactElement<ElementProps>): ReactElement<ElementProps>[] {
  return [element, ...Children.toArray(element.props.children)
    .filter(isValidElement<ElementProps>)
    .flatMap(descendants)];
}

const validValues: SaveCollectionFormValues = {
  staffNickname: "Fixture Collector", customerName: "Synthetic Customer",
  icNumber: "900101010101", customerPhone: "0123456789", accountNumber: "000123456789",
  cardNumber: "00009007199254740993", batch: "P10", paymentDate: "2020-01-01", amount: "100.00",
};

const invalidValues: SaveCollectionFormValues = {
  staffNickname: "", customerName: "", icNumber: "", customerPhone: "", accountNumber: "",
  cardNumber: "", batch: "invalid" as SaveCollectionFormValues["batch"], paymentDate: "", amount: "",
};

function summary(values: SaveCollectionFormValues, overrides: Partial<ComponentProps<typeof SaveCollectionReadySummary>> = {}) {
  return SaveCollectionReadySummary({
    values, readiness: getSaveCollectionReadiness(values), receiptCount: 0, receiptDrafts: [],
    cardNumberVisible: false, onToggleCardNumberVisibility: () => undefined, ...overrides,
  });
}

function correctionButtons(element: ReactElement<ElementProps>) {
  return descendants(element).filter((child) => child.type === "button" && child.props["aria-label"]?.startsWith("Betulkan "));
}

test("correction actions expose only invalid editable fields with full labels and safe touch targets", () => {
  const selected: SaveCollectionFieldName[] = [];
  const tree = summary(invalidValues, { onCorrectField: (field) => selected.push(field) });
  const buttons = correctionButtons(tree);
  assert.equal(buttons.length, 8);
  assert.deepEqual(selected, [], "rendering must never focus or validate fields");
  for (const [index, [field, target]] of Object.entries(SAVE_COLLECTION_FIELD_TARGETS).entries()) {
    const button = buttons[index]!;
    assert.equal(button.props.type, "button");
    assert.equal(button.props["aria-label"], `Betulkan ${target.label}`);
    assert.equal(button.props["aria-controls"], target.id);
    assert.match(button.props.className ?? "", /min-h-11 min-w-11/);
    assert.match(button.props.className ?? "", /focus-visible:ring-2/);
    button.props.onClick?.();
    assert.equal(selected[selected.length - 1], field);
  }
  assert.doesNotMatch(renderToStaticMarkup(tree), /Betulkan Staff|Betulkan Receipt/);
});

test("valid, corrected and callback-free summaries have no irrelevant correction actions", () => {
  assert.equal(correctionButtons(summary(validValues, { onCorrectField: () => undefined })).length, 0);
  assert.equal(correctionButtons(summary(invalidValues)).length, 0);
  const onCorrectField = () => undefined;
  assert.deepEqual(correctionButtons(summary({ ...validValues, customerName: "" }, { onCorrectField }))
    .map((button) => button.props["aria-label"]), ["Betulkan Customer Name"]);
  assert.equal(correctionButtons(summary({ ...validValues, staffNickname: "" }, { onCorrectField })).length, 0);
});

test("disabled correction controls do not invoke their callback", () => {
  let called = 0;
  const buttons = correctionButtons(summary(invalidValues, {
    onCorrectField: () => { called += 1; }, correctionDisabled: true,
  }));
  for (const button of buttons) {
    assert.equal(button.props.disabled, true);
    button.props.onClick?.();
  }
  assert.equal(called, 0);
});

test("summary corrections preserve masked-card privacy and independent visibility control", () => {
  let visibilityChanges = 0;
  const tree = summary({ ...validValues, customerName: "" }, {
    onCorrectField: () => undefined,
    onToggleCardNumberVisibility: () => { visibilityChanges += 1; },
  });
  correctionButtons(tree)[0]!.props.onClick?.();
  assert.equal(visibilityChanges, 0);
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /Card ending 0993/);
  assert.doesNotMatch(markup, /00009007199254740993/);
  assert.match(markup, /Show full card number in review/);
});

test("field navigation focuses and scrolls every local target without clicking or exposing values", () => {
  for (const [field, target] of Object.entries(SAVE_COLLECTION_FIELD_TARGETS)) {
    const calls: unknown[] = [];
    const element = {
      matches: (selector: string) => { calls.push(["matches", selector]); return false; },
      focus: (options: FocusOptions) => calls.push(["focus", options]),
      scrollIntoView: (options: ScrollIntoViewOptions) => calls.push(["scroll", options]),
      click: () => assert.fail("navigation must not open calendar/select or reveal card"),
    } as unknown as HTMLElement;
    const targetDocument = {
      getElementById: (id: string) => { assert.equal(id, target.id); return element; },
    };
    assert.equal(focusSaveCollectionField(field as SaveCollectionFieldName, targetDocument), true);
    assert.deepEqual(calls, [
      ["matches", ":disabled, [aria-disabled='true']"],
      ["focus", { preventScroll: true }],
      ["scroll", { block: "center", inline: "nearest" }],
    ]);
  }
});

test("field navigation safely ignores missing, disabled, suspended and external targets", () => {
  assert.equal(getSaveCollectionFieldTarget("staffNickname"), undefined);
  assert.equal(focusSaveCollectionField("staffNickname", {
    getElementById: () => assert.fail("external selection has no local target"),
  }), false);
  assert.equal(focusSaveCollectionField("customerName", { getElementById: () => null }), false);
  for (const disabledBy of ["self", "fieldset", "aria-disabled"]) {
    const element = {
      matches: () => true,
      focus: () => assert.fail(`must not focus when disabled by ${disabledBy}`),
      scrollIntoView: () => assert.fail("must not scroll disabled target"),
    } as unknown as HTMLElement;
    assert.equal(focusSaveCollectionField("customerName", { getElementById: () => element }), false);
  }
  assert.equal(focusSaveCollectionField("customerName"), false, "safe without a browser document");
});

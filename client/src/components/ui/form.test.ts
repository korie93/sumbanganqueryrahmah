import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm, type FieldValues } from "react-hook-form";
import {
  Form,
  FormField,
  FormItem,
  mergeAriaDescribedByIds,
  useFormField,
} from "@/components/ui/form";

test("mergeAriaDescribedByIds preserves caller ids and appends stable form ids once", () => {
  assert.equal(
    mergeAriaDescribedByIds(
      "custom-help custom-help",
      "field-description",
      "field-message",
      "field-description",
    ),
    "custom-help field-description field-message",
  );
});

function MissingFormFieldProbe() {
  useFormField();
  return createElement("div");
}

function MissingFormFieldHarness() {
  const methods = useForm<FieldValues>({
    defaultValues: { email: "" },
  });

  return createElement(
    Form,
    {
      ...methods,
      children: createElement(FormItem, null, createElement(MissingFormFieldProbe)),
    },
  );
}

function MissingFormItemProbe() {
  useFormField();
  return createElement("div");
}

function MissingFormItemHarness() {
  const methods = useForm<FieldValues>({
    defaultValues: { email: "" },
  });

  return createElement(
    Form,
    {
      ...methods,
      children: createElement(FormField, {
        name: "email",
        control: methods.control,
        render: () => createElement(MissingFormItemProbe),
      }),
    },
  );
}

test("useFormField throws clearly when FormField context is missing", () => {
  assert.throws(
    () => renderToStaticMarkup(createElement(MissingFormFieldHarness)),
    /useFormField should be used within <FormField>/,
  );
});

test("useFormField throws clearly when FormItem context is missing", () => {
  assert.throws(
    () => renderToStaticMarkup(createElement(MissingFormItemHarness)),
    /useFormField should be used within <FormItem>/,
  );
});

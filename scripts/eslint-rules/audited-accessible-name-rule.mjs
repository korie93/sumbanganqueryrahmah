function getJsxAttribute(openingElement, attributeName) {
  return openingElement.attributes.find((attribute) =>
    attribute.type === "JSXAttribute"
    && attribute.name?.type === "JSXIdentifier"
    && attribute.name.name === attributeName);
}

function readJsxAttributeTextValue(openingElement, attributeName, sourceCode) {
  const attribute = getJsxAttribute(openingElement, attributeName);
  if (!attribute) {
    return null;
  }

  if (!attribute.value) {
    return "";
  }

  if (attribute.value.type === "Literal") {
    return typeof attribute.value.value === "string" ? attribute.value.value : String(attribute.value.value ?? "");
  }

  if (
    attribute.value.type === "JSXExpressionContainer"
    && attribute.value.expression.type !== "JSXEmptyExpression"
  ) {
    return sourceCode.getText(attribute.value.expression).trim();
  }

  return null;
}

function hasAccessibleNameAttribute(openingElement, sourceCode) {
  return ["aria-label", "aria-labelledby", "title"].some((attributeName) => {
    const value = readJsxAttributeTextValue(openingElement, attributeName, sourceCode);
    return typeof value === "string" && value.trim().length > 0;
  });
}

function jsxElementName(openingElement) {
  return openingElement.name?.type === "JSXIdentifier" ? openingElement.name.name : null;
}

function hasVisibleTextContent(node) {
  if (!node) {
    return false;
  }

  if (node.type === "JSXText") {
    return node.value.trim().length > 0;
  }

  if (node.type === "Literal") {
    return typeof node.value === "string" && node.value.trim().length > 0;
  }

  if (node.type === "JSXExpressionContainer") {
    if (node.expression.type === "Literal") {
      return typeof node.expression.value === "string" && node.expression.value.trim().length > 0;
    }
    if (node.expression.type === "TemplateLiteral") {
      return node.expression.quasis.some((quasi) => quasi.value.cooked?.trim());
    }
    return false;
  }

  if (node.type === "JSXElement" || node.type === "JSXFragment") {
    return node.children.some((child) => hasVisibleTextContent(child));
  }

  return false;
}

function hasAncestorLabel(node) {
  let current = node.parent;
  while (current) {
    if (current.type === "JSXElement") {
      const currentName = jsxElementName(current.openingElement);
      if (currentName === "Label" || currentName === "FormLabel" || currentName === "label") {
        return true;
      }
    }
    current = current.parent;
  }

  return false;
}

function findSubtreeRoot(node) {
  let current = node.parent;
  let lastJsxContainer = null;

  while (current) {
    if (current.type === "JSXElement" || current.type === "JSXFragment") {
      lastJsxContainer = current;
    }
    current = current.parent;
  }

  return lastJsxContainer;
}

function subtreeHasMatchingLabel(node, controlId, sourceCode) {
  const subtreeRoot = findSubtreeRoot(node);
  if (!subtreeRoot || !controlId) {
    return false;
  }

  const stack = [subtreeRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (current.type === "JSXElement") {
      const currentName = jsxElementName(current.openingElement);
      if (currentName === "Label" || currentName === "FormLabel" || currentName === "label") {
        const htmlForValue = readJsxAttributeTextValue(current.openingElement, "htmlFor", sourceCode);
        if (htmlForValue && htmlForValue === controlId) {
          return true;
        }
      }

      for (const child of current.children) {
        if (child.type === "JSXElement" || child.type === "JSXFragment") {
          stack.push(child);
        }
      }
      continue;
    }

    if (current.type === "JSXFragment") {
      for (const child of current.children) {
        if (child.type === "JSXElement" || child.type === "JSXFragment") {
          stack.push(child);
        }
      }
    }
  }

  return false;
}

function findEnclosingComponentName(node) {
  let current = node.parent;

  while (current) {
    if (current.type === "FunctionDeclaration" && current.id?.type === "Identifier") {
      return current.id.name;
    }

    if (
      current.type === "VariableDeclarator"
      && current.id.type === "Identifier"
    ) {
      return current.id.name;
    }

    current = current.parent;
  }

  return null;
}

function shouldSkipWrappedInputEnforcement(node, filename) {
  const normalizedFilename = filename.replaceAll("\\", "/");
  if (normalizedFilename.endsWith("/client/src/components/ui/sidebar-primitives.tsx")) {
    return true;
  }

  return findEnclosingComponentName(node) === "SidebarInput";
}

export const auditedAccessibleNameRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require accessible names for audited icon-only buttons and wrapped inputs.",
    },
    schema: [],
    messages: {
      missingIconButtonName:
        "Icon-only Button components must include an accessible name via text, aria-label, aria-labelledby, or title.",
      missingInputName:
        "Input components must expose an accessible name via a label, aria-label, aria-labelledby, or title.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      JSXElement(node) {
        const openingElement = node.openingElement;
        const elementName = jsxElementName(openingElement);

        if (elementName === "Button") {
          const sizeValue = readJsxAttributeTextValue(openingElement, "size", sourceCode);
          if (sizeValue !== "icon") {
            return;
          }

          if (hasAccessibleNameAttribute(openingElement, sourceCode) || hasVisibleTextContent(node)) {
            return;
          }

          context.report({
            node: openingElement,
            messageId: "missingIconButtonName",
          });
          return;
        }

        if (elementName !== "Input") {
          return;
        }

        if (shouldSkipWrappedInputEnforcement(node, context.filename)) {
          return;
        }

        const inputType = readJsxAttributeTextValue(openingElement, "type", sourceCode);
        if (inputType === "hidden") {
          return;
        }

        if (hasAccessibleNameAttribute(openingElement, sourceCode) || hasAncestorLabel(node)) {
          return;
        }

        const controlId = readJsxAttributeTextValue(openingElement, "id", sourceCode);
        if (controlId && subtreeHasMatchingLabel(node, controlId, sourceCode)) {
          return;
        }

        context.report({
          node: openingElement,
          messageId: "missingInputName",
        });
      },
    };
  },
};

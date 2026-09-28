import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import ts from "typescript";

const directory = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = postcss.parse(readFileSync(path.join(directory, "landing-v21.css"), "utf8"));
const sourceFiles = [
  path.resolve(directory, "../Landing.tsx"),
  ...readdirSync(directory)
    .filter(name => /\.tsx?$/.test(name) && !name.endsWith(".test.ts"))
    .map(name => path.join(directory, name)),
].map(filename => ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true));

function descendants(node: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (child: ts.Node) => { nodes.push(child); ts.forEachChild(child, visit); };
  ts.forEachChild(node, visit);
  return nodes;
}

function methodName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

function nearestFunction(node: ts.Node): ts.Node | undefined {
  let parent = node.parent;
  while (parent) {
    if (ts.isArrowFunction(parent) || ts.isFunctionExpression(parent) || ts.isFunctionDeclaration(parent)) return parent;
    parent = parent.parent;
  }
  return undefined;
}

function assignedName(node: ts.Node): string | undefined {
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent)) return parent.name.getText();
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) return parent.left.getText();
  return undefined;
}

test("every landing CSS rule stays beneath its page namespace", () => {
  let rules = 0;
  stylesheet.walkRules(rule => {
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) {
      for (const selector of rule.selectors) assert.match(selector, /^(?:from|to|\d+(?:\.\d+)?%)$/);
      return;
    }
    rules++;
    for (const selector of rule.selectors) {
      assert.match(selector, /^\.sqr-landing(?=[\s.#[:]|$)/, `Unscoped selector at line ${rule.source?.start?.line}: ${selector}`);
      assert.doesNotMatch(selector, /:global\b|:root\b|(?:^|[\s>+~])(?:html|body)(?=[\s.#[:>+~]|$)/, selector);
      // A sibling combinator at the root could reach outside the landing page.
      assert.doesNotMatch(selector, /^\.sqr-landing(?:[.#][\w-]+|\[[^\]]+\])*\s*[+~]/, selector);
    }
  });
  assert.ok(rules > 0, "The production landing stylesheet must be inspected");
});

test("landing keyframes and animation references cannot collide with application animations", () => {
  const names = new Set<string>();
  stylesheet.walkAtRules(/keyframes$/i, rule => {
    assert.match(rule.params, /^sqr-landing-[\w-]+$/, `Global keyframe name: ${rule.params}`);
    names.add(rule.params);
  });
  const keywords = new Set(["none", "initial", "inherit", "unset", "revert", "revert-layer", "infinite", "normal", "reverse", "alternate", "alternate-reverse", "forwards", "backwards", "both", "running", "paused", "linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end"]);
  let references = 0;
  stylesheet.walkDecls(/^(?:-webkit-)?animation(?:-name)?$/, declaration => {
    for (const animation of postcss.list.comma(declaration.value)) {
      for (const token of postcss.list.space(animation)) {
        if (keywords.has(token) || /^-?(?:\d*\.)?\d+(?:m?s)?$/.test(token) || /^(?:var|steps|cubic-bezier|linear)\(/.test(token)) continue;
        references++;
        assert.ok(names.has(token), `Animation must reference a landing-owned keyframe: ${token}`);
      }
    }
  });
  assert.ok(names.size > 0 && references > 0);
});

test("landing CSS has no external imports, assets or document-wide registrations", () => {
  stylesheet.walkAtRules(rule => {
    assert.ok(["media", "supports", "container", "keyframes", "-webkit-keyframes"].includes(rule.name), `Unexpected global CSS registration: @${rule.name}`);
    assert.doesNotMatch(rule.params, /https?:|\/\/|url\(/i);
  });
  stylesheet.walkDecls(declaration => {
    assert.doesNotMatch(declaration.value, /(?:https?:|\/\/|url\s*\()/i, `Landing visual assets must remain local CSS primitives: ${declaration.prop}`);
  });
});

test("landing components do not import application auth, API clients or additional runtimes", () => {
  const approvedShared = new Set(["react", "@/lib/aria-state-props", "@/lib/low-spec-mode"]);
  for (const source of sourceFiles) {
    for (const node of descendants(source)) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
        const moduleName = node.moduleSpecifier.text;
        if (moduleName.startsWith(".")) {
          const resolved = path.resolve(path.dirname(source.fileName), moduleName);
          assert.ok(resolved.startsWith(`${directory}${path.sep}`), `${source.fileName}: dependency leaves the landing subtree (${moduleName})`);
        } else {
          assert.ok(approvedShared.has(moduleName), `${source.fileName}: unexpected runtime dependency (${moduleName})`);
        }
      }
      if (ts.isCallExpression(node)) {
        assert.notEqual(node.expression.kind, ts.SyntaxKind.ImportKeyword, "Landing must not dynamically load auth or API modules");
        assert.ok(!["fetch", "sendBeacon", "require"].includes(methodName(node.expression) ?? ""), `${source.fileName}: public preview must not load live data`);
      }
      if (ts.isNewExpression(node)) {
        assert.ok(!["WebSocket", "EventSource", "XMLHttpRequest"].includes(methodName(node.expression) ?? ""), `${source.fileName}: public preview must not connect to live services`);
      }
      if (ts.isJsxAttribute(node) && ["src", "srcSet", "href"].includes(node.name.getText()) && node.initializer && ts.isStringLiteral(node.initializer)) {
        assert.doesNotMatch(node.initializer.text, /^(?:[a-z][a-z\d+.-]*:|\/\/)/i, `${source.fileName}: unexpected external asset or navigation`);
      }
    }
  }
});

test("landing observers, event listeners and scheduled work belong to effects with matching cleanup", () => {
  const resources = { observers: 0, listeners: 0, timers: 0 };
  const timerCleanup = new Map([["setInterval", "clearInterval"], ["setTimeout", "clearTimeout"], ["requestAnimationFrame", "cancelAnimationFrame"]]);
  for (const source of sourceFiles) {
    const nodes = descendants(source);
    const effects = nodes.filter((node): node is ts.CallExpression => ts.isCallExpression(node) && methodName(node.expression) === "useEffect");
    const effectCallbacks = effects.map(effect => effect.arguments[0]).filter((node): node is ts.ArrowFunction | ts.FunctionExpression => Boolean(node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node))));
    for (const node of nodes) {
      const observer = ts.isNewExpression(node) && ["IntersectionObserver", "ResizeObserver", "MutationObserver"].includes(methodName(node.expression) ?? "");
      const listener = ts.isCallExpression(node) && methodName(node.expression) === "addEventListener";
      const timer = ts.isCallExpression(node) ? timerCleanup.get(methodName(node.expression) ?? "") : undefined;
      if (!observer && !listener && !timer) continue;
      const owner = effectCallbacks.find(effect => {
        let parent: ts.Node | undefined = node.parent;
        while (parent && parent !== effect) parent = parent.parent;
        return parent === effect;
      });
      assert.ok(owner, `${source.fileName}: resources must be allocated inside a lifecycle effect`);
      const cleanups = descendants(owner).filter((child): child is ts.ReturnStatement => ts.isReturnStatement(child)
        && nearestFunction(child) === owner
        && Boolean(child.expression && (ts.isArrowFunction(child.expression) || ts.isFunctionExpression(child.expression))));
      const cleanupCalls = cleanups.flatMap(cleanup => descendants(cleanup)).filter((child): child is ts.CallExpression => ts.isCallExpression(child));
      if (observer) {
        resources.observers++;
        const name = assignedName(node);
        assert.ok(name && cleanupCalls.some(call => ts.isPropertyAccessExpression(call.expression)
          && call.expression.expression.getText() === name && call.expression.name.text === "disconnect"), `${source.fileName}: observer must disconnect in its owning effect cleanup`);
      }
      if (listener && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        resources.listeners++;
        const target = node.expression.expression.getText();
        const args = node.arguments.slice(0, 2).map(argument => argument.getText());
        assert.ok(cleanupCalls.some(call => ts.isPropertyAccessExpression(call.expression)
          && call.expression.expression.getText() === target && call.expression.name.text === "removeEventListener"
          && call.arguments.slice(0, 2).every((argument, index) => argument.getText() === args[index])
          && call.arguments.length >= 2), `${source.fileName}: listener must remove the same event and callback from ${target}`);
      }
      if (timer) {
        resources.timers++;
        const name = assignedName(node);
        assert.ok(name && cleanupCalls.some(call => methodName(call.expression) === timer && call.arguments[0]?.getText() === name), `${source.fileName}: ${timer} must cancel the allocated handle in effect cleanup`);
      }
    }
  }
  for (const [kind, count] of Object.entries(resources)) assert.ok(count > 0, `Must inspect existing ${kind} ownership`);
});

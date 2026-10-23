# Landing accessibility audit under CSP

[CI run 39948627158, smoke-ui job 120399599613](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/39948627158/job/120399599613)
tested commit `ffb82b93`: 620 browser tests passed and two failed. Both failures
were the new landing image/accessibility tests at 1440px and 390px. There were
no screenshot mismatches.

The failure occurred at `landing-image-a11y.spec.ts:136`, where
`page.addScriptTag({ content: axeSource })` assigns a string to the script
element's text. The application server enforces Trusted Types, so Chromium
rejected this assignment with a `TrustedScript` TypeError. The earlier static
preview did not send the application's CSP headers and missed this difference.

The test now loads axe through `page.evaluate(axeSource)`, matching the existing
accessibility tests. Its same-origin navigation-document fixture also appends
`script-src 'self'; require-trusted-types-for 'script'` to any existing CSP.
This makes static previews exercise the relevant restriction while retaining
the application server's policy when present. Asset and API responses are not
rewritten by this document fixture.

The source contract in `scripts/tests/visual-snapshot-contract.test.mjs` checks
the evaluation method, document/origin guards and preservation of existing CSP.
It rejects inline script injection and policy bypasses. The browser tests still
check the held-image geometry, named strengths group and accessibility result.

This repair changes tests and documentation only. Production CSP, application
behavior, screenshot baselines and comparison tolerances are unchanged.

Local verification reproduced both original TrustedScript failures with the
strict header enabled, before changing the injection method. After the fix,
the landing tests pass on bundled Chromium 148 and installed Chrome 155. The
test also waits for `html.app-ready` and scopes its heading to `.sqr-landing`,
so the transient boot-shell heading cannot cause an ambiguous locator.

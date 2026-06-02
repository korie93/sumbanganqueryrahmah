# Storybook Component Documentation Setup Guide

AUDIT2-FIX [L5]: This guide defines a safe Storybook rollout path for documenting SQR components without changing the production client bundle.

## Goal

Use Storybook as a developer-only component workbench for complex UI states, accessibility checks, and visual review. Keep the first rollout documentation-only until the team is ready to add Storybook dependencies and CI jobs in a dedicated PR.

## Installation

Run the initializer from a clean branch:

```bash
npx storybook@latest init --type react
```

Choose the Vite builder so Storybook follows the existing React and Vite stack.

After installation, verify that production build output is unchanged:

```bash
npm run lint:client
npm run typecheck
npm run build
```

## Recommended Scripts

When Storybook is installed, add these scripts to `package.json`:

```json
{
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build"
}
```

Do not run Storybook in production. It is a local and CI documentation tool only.

## Priority Components

Document components in this order:

1. `FloatingAI`: multiple modes, async states, and dismiss behavior.
2. `Navbar`: responsive layout, authenticated state, collapsed state, and keyboard navigation.
3. `ErrorBoundary`: fallback UI, retry behavior, and recovery copy.
4. Form controls: validation, disabled state, loading state, and accessibility labels.
5. Data display components: empty, loading, partial failure, and high-density data states.

## Story Template

Use Component Story Format with typed metadata:

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { YourComponent } from "./YourComponent";

const meta = {
  title: "Components/YourComponent",
  component: YourComponent,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof YourComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const ErrorState: Story = {
  args: {
    error: "Unable to load data.",
  },
};
```

## Accessibility Checks

Every story for interactive components should include:

- Focus-visible state.
- Keyboard-only operation.
- Disabled and loading states.
- Screen-reader labels for icon-only controls.
- Color contrast review for badges, buttons, and compact text.

## CI Integration

Add the build step only after the Storybook dependency PR is merged:

```yaml
- name: Build Storybook
  run: npm run build-storybook
```

If visual review is later added, keep it separate from the existing production smoke and accessibility contracts so Storybook failures are easy to triage.

## Rollout Checklist

- [ ] Create a dedicated Storybook setup branch.
- [ ] Add Storybook dependencies and scripts.
- [ ] Add the first four priority component stories.
- [ ] Run `npm run lint:client`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build-storybook`.
- [ ] Add CI Storybook build after local verification passes.
- [ ] Confirm production `npm run build` remains green.

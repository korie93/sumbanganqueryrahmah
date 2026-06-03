# State Management Decision

Status: accepted

## Decision

SQR will continue using local React state, focused context providers, and
TanStack Query for server state. A global client-side state store is not
introduced at this time.

## Rationale

Current state usage is localized:

- page filters and dialogs use `useState`
- monitor and AI shell concerns use focused context providers
- API/server state is already delegated to TanStack Query
- no broad prop-drilling pattern currently justifies a new global store

Adding Redux, Zustand, or another app-wide store would increase dependency and
mental overhead without removing a demonstrated bottleneck.

## Review Triggers

Revisit this decision if any of the following become true:

- the same mutable UI state is shared across five or more unrelated route trees
- prop chains regularly exceed three ownership boundaries
- optimistic updates become common across multiple domains
- debugging state transitions becomes a recurring production incident pattern

Next scheduled review: Q4 2026.

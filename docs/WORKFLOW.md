# Workflow

This document describes how work is tracked and delivered in this repository.
It is intentionally tooling-agnostic and should work for any contributor environment.

## Source of truth

- **Issues are the source of truth** for scope, acceptance criteria, and test notes.
- The **Project board is a convenience view** for status and filtering.

## Where to ask questions

- Use **Discussions** for questions, ideas, and general support.
- Use **Issues** for actionable work items (Tasks and Bugs).

## Issue types and templates

Open a new issue using one of these templates:

- **Task**: planned work (feature, refactor, docs, chore).
- **Bug report**: something is broken or unexpected.

### Required content

Every issue should include:

- Summary
- Acceptance criteria
- Manual test scenario (Phase 3/4) or `N/A`

## Labels

This repo uses minimal labels:

- `type:task`
- `type:bug`

Component and priority are captured in the issue template fields.
If maintainers decide to add more labels later (e.g., `component:*`, `priority:*`), they should remain prefix-based and be kept minimal.

> Tip: remove unused default GitHub labels to avoid confusion.

## Milestones (phases)

Phases are tracked with **GitHub milestones** (e.g., `Phase 3`, `Phase 4`, `Phase 5`).

- Phase 3/4: manual, scenario-based testing.
- Phase 5: detailed tests (including test code) become the primary quality gate.

## Project status

The Project board tracks work state. Recommended status values:

- **Inbox**: newly created issue, needs triage
- **Ready**: scoped and ready to be picked up
- **In Progress**: actively being worked on
- **In Review**: implementation done, awaiting review
- **Blocked**: cannot proceed
- **Done**: finished (issue closed)

## Testing responsibility (Phase 3/4)

Manual testing is scenario-based in Phase 3/4:

- **In Progress**: the developer runs manual checks following the issue’s “Manual test scenario”.
- **In Review**: the reviewer re-checks key flows (also following the same scenario),
  focusing on regressions and edge cases.

If the scenario is insufficient, update the issue to improve it.

## Typical lifecycle

1. **Create an Issue**

   - Use the Task or Bug template.
   - Assign a milestone (Phase 3/4/5) if known.

2. **Triage (Inbox)**

   - Ensure scope and acceptance criteria are clear.
   - If actionable: Status **Inbox** → **Ready**.
   - If it cannot proceed: Status → **Blocked** (add a comment explaining why).

3. **Implement**

   - Create a branch and open a Pull Request (PR).
   - Link the PR to the issue (e.g., “Closes #123”).
   - Keep changes focused; split large work into smaller issues if needed.

4. **Review (In Review)**

   - Reviewer checks acceptance criteria and docs impact.
   - Reviewer performs manual verification per the issue scenario (Phase 3/4).
   - Address feedback, then merge.

5. **Close**
   - Close the issue when acceptance criteria are met and verification is complete.
   - Project Status becomes **Done**.

## Recording decisions (lightweight)

When a design/behavior decision is made, record it in the relevant issue thread as a short comment:

- **Decision**: ...
- **Rationale**: ...
- **Impact**: ...
- **Follow-ups**: ...

This keeps decision history close to the work without introducing a separate process.

## Automation

Project automations should keep manual work low:

- When an issue is created, add it to the Project and set Status to **Inbox**.
- When an issue is closed, set Status to **Done**.

Avoid relying on Project-only fields for essential information.

# AGENTS.md (GyuPic)

Last updated: 2025-12-26 (JST)

This file is the **working constitution (rules)** for developing GyuPic.  
For now we assume local development only, and this file is **NOT committed**.

> Policy: Keep AGENTS “thin”.  
> Put detailed specs into `docs/requirements.*` / `docs/design.*`, and avoid stuffing implementation details into AGENTS.

---

## 0. Purpose

- Improve development efficiency with AI (Codex/ChatGPT) while avoiding regressions and accidents.
- Make changes small, safe, and always explicit about rationale and acceptance criteria.

---

## 1. Source of truth and language

- **Japanese docs (`*.ja.md`) are the source of truth.** English docs (`*.md`) are synchronized copies.
- Conversations should be in Japanese by default. Prefer terminology/UI wording from the Japanese docs.
- If there is a conflict, the Japanese docs win; then sync the English docs accordingly.

References:

- `docs/requirements.ja.md` (source of truth)
- `docs/design.ja.md` (source of truth)

---

## 2. Workflow (must do before editing)

When an AI agent receives a task, it must output the following **before editing** (keep it short):

1. Scope / impact area (files or areas likely to be touched)
2. 2–3 approaches (with pros/cons)
3. Risks / edge cases (regressions, UX, performance, data consistency, concurrency, etc.)

After the approach is decided: 4) Produce the smallest possible diff  
5) Propose at least one test/check command (a human decides whether to run it)  
6) Provide the completion report (see Section 5)

---

## 3. Things you must not do

### 3.1 Risky “drive-by” changes

- No unrelated cleanups (formatting/renaming/moving files) unless explicitly requested.
- Large refactors must be split into separate tasks with proposal → agreement → execution.

### 3.2 Security / sensitive data

- Do not read, print, or paste `.env` / secrets / tokens (even if you can see them).

### 3.3 Destructive commands

- Do not run destructive or wide-scope deletion commands (e.g., `rm -rf`, blanket `git clean -fdx`).

---

## 4. No commits (important)

- **AI must not commit.**
  - Do not run: `git commit` / `git merge` / `git rebase` / `git cherry-pick` / `git push`.
- AI may provide only:
  - diffs (edits)
  - suggested commands (humans decide to run them)
  - suggested commit message (Conventional Commits, within 72 characters)
  - suggested PR title/body (English, if needed)

---

## 5. Required outputs (every time)

A completion report must include:

- Summary of changes (what changed and why)
- Files changed list
- Risks / concerns (regressions, UX, performance, data consistency, etc.)
- Manual test steps (short is fine)
- Suggested commit message (Conventional Commits, within 72 characters)
- Suggested PR title + PR body (English, if needed)

---

## 6. Comment policy (Japanese → English two-line pair)

Targets: `*.ts, *.tsx, *.js, *.jsx, *.json, *.jsonc, *.html, *.css`

- When creating/editing comments, prefer:
  - Line 1: Japanese
  - Line 2: English translation (same meaning and tone)
- If the task is only translation / comment addition, **do not change code behavior**.
- If a Japanese+English pair already exists, keep both; only minimal edits for correctness.
- Existing English-only comments may remain as-is unless requested otherwise.

---

## 7. How to update AGENTS (lightweight process)

When updating AGENTS, do not attempt to share the entire codebase context. Use a minimal information set.

### 7.1 Minimal context to share in Web ChatGPT

1. Current text (only the relevant section)
2. Proposed change (1–5 lines)
3. Rationale (1–5 lines)
4. Acceptance criteria (3–7 bullet points)
5. Impact level (Low/Med/High)

### 7.2 When current implementation facts are needed

- Delegate repository reading to Codex.
- Ask Codex to provide:
  - relevant implementation locations (files/functions/state)
  - a short description of current behavior
  - short evidence snippets (minimal quotes)
- Use that summary as the basis to finalize the updated text in Web ChatGPT.

---

## 8. Reduce sharing cost (recommended)

If sharing “current status” becomes heavy, create a lightweight snapshot file:

- `docs/status/status-YYYYMMDD.ja.md`

Keep it short:

- current phase/milestone
- key flows
- known issues / TODOs
- recent changes

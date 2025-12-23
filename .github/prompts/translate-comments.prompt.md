---
agent: edit
description: 'Translate Japanese comments in the active file and add English translations on the next line.'
---

You are editing the currently active file in the user's editor.

Task:

- Scan only the active file.
- For every code comment that contains Japanese text:
  - Keep the existing comment as-is.
  - Insert an English translation comment on the next line.
- Supported comment syntaxes include:
  - `// ...` and `/* ... */` in TypeScript, JavaScript, React, JSONC, CSS-in-JS.
  - `<!-- ... -->` in HTML.
  - `/* ... */` in CSS.
- Do NOT modify any non-comment code.
- If a comment already has a Japanese line followed by a correct English translation, leave it unchanged.

Constraints:

- Preserve meaning and tone in the English translation.
- Do not simplify or change technical intent.

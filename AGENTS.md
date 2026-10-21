<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Standing rules

These come from the project owner and apply to every session.

- **Never commit without permission.** Do not run `git commit`, `git push`,
  `git merge`, `git rebase`, `git reset --hard`, or any other command that
  changes history or the working tree in a way the owner did not ask for.
  Stage nothing, commit nothing. Present the diff and wait.
- **Never start the application yourself.** The owner runs the app in the
  VS Code integrated terminal. Do not start `next dev`, `next start`, a
  database container, or any other long-running process on their machine.
  When a task needs one, hand over the exact command and wait.
- **Backups run on their own.** The diary is mirrored to a Google Sheet and a
  standby PostgreSQL database every fifteen minutes, and again after every
  trip is saved. Do not add a second scheduler or a second copy of the data
  without asking.


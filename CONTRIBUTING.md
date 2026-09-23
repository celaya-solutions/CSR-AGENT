# Contributing to OpenAgent

OpenAgent is a course edition maintained by Celaya Solutions and derived from
OpenClaw. Read [`VISION.md`](VISION.md) for scope and [`AGENTS.md`](AGENTS.md)
for the working rules that apply to every change.

## How to Contribute

1. **Bugs and small fixes**: open a pull request in this repository.
2. **New features or architecture changes**: open an issue first. Most new
   capability belongs in a plugin built on the plugin SDK, not in core.
3. **Refactor-only changes**: open them only when a maintainer asks for one as
   part of a concrete fix.
4. **Security vulnerabilities**: follow [`SECURITY.md`](SECURITY.md); do not
   file a public issue.

For a pull request, describe the problem, the change, the user impact, and the
evidence that it works. Fill out the [PR template](.github/pull_request_template.md).

## Source dependencies

Run `pnpm install --frozen-lockfile` from the workspace root. Source checkouts use
pnpm's isolated linker, which keeps dependencies in `node_modules/.pnpm` and links
them into each workspace package. On supported macOS volumes, this also lets pnpm
reuse whole-package APFS clones instead of importing every file separately.

Give each source checkout its own physical dependency installation. Tooling does
not automatically link a missing `node_modules` to another checkout. Existing
borrowed installs can still serve direct Node tooling. Normal pnpm install checks
the checkout-root `node_modules`, the explicitly configured root module directory,
and their `.pnpm` directories before reconciliation, refusing borrowed links there.
Preserve that donor and create an independently owned install instead of removing
or reinstalling through its link. Explicit hydrated module directories remain
supported when the workspace link points to the configured physical directory.
This admission check runs through `pnpm:devPreinstall`; `--ignore-scripts` skips
it. The check does not lock paths against concurrent replacement, inspect every
workspace package's dependencies, or validate every alternate pnpm directory setting.

When updating a checkout that used the hoisted layout, stop builds, tests, and
watchers using that checkout's dependencies before running the install command.
Do not change the linker while other jobs are using the same `node_modules`.
Declare dependencies in the package that imports them; root tooling and tests
must declare their own development dependencies rather than rely on hoisting.

## Before You PR

- Use **Node 24.16+ LTS** or **Node 26.1+** for source checkouts. Older Node releases can truncate SQLite TEXT reads; Node 22, 23, and 25 are unsupported. See [Node install guidance](docs/install/node.md) if your local version is too old.
- Run the Vitest 5 suite on Node 24.16+ or Node 26.1+, matching the packaged runtime floor.
- Test locally with your OpenAgent instance
- An explicit maintainer repair-and-land request covers internal database scheduling, admission, and lifecycle decisions. The implementer owns the design and its verification. Get separate design acceptance when changing public contracts, schemas, durability, retention, or permissions; see the [database schema review checkpoint](docs/reference/database-schemas.md#review-checkpoint-for-material-changes).
- External PRs must describe the user, product, or operational problem in **What Problem This Solves** and include useful validation in **Evidence**. Focused tests, CI results, screenshots, recordings, terminal output, live observations, redacted logs, and artifact links all count. Reviewers will inspect the code, tests, and CI; use the PR body to explain intent and make validation easy to understand.
- Follow the [PR template](.github/pull_request_template.md): lead with the plain-language problem and concrete user impact, then a brief explanation and useful evidence. Keep technical inventories in the diff or optional details, not the opening summary. Keep important risks, migrations, required actions, and evidence gaps visible; do not invent a user benefit for internal-only work.
- Keep PRs takeover-ready: open them from a branch maintainers can push to. For fork PRs, leave GitHub's **Allow edits by maintainers** option enabled so maintainers can finish urgent fixes or merge prep when needed. If GitHub shows **Allow edits and access to secrets by maintainers**, enable it only when that workflow/secrets access is acceptable and say so in the PR.
- Run tests: `pnpm build && pnpm check && pnpm test`
- For iterative local commits after running equivalent targeted validation for the touched surface, `git commit --no-verify` skips commit hooks.
- For extension/plugin changes, run the fast local lane first:
  - `pnpm test:extension <extension-name>`
  - `pnpm test:extension --list` to see valid extension ids
  - If you changed shared plugin or channel surfaces, run `pnpm test:contracts`
  - For targeted shared-surface work, use `pnpm test:contracts:channels` or `pnpm test:contracts:plugins`
  - These commands also cover the shared seam/smoke files that the default unit lane skips
  - If you changed broader runtime behavior, still run the relevant wider lanes (`pnpm test:extensions`, `pnpm test:channels`, or `pnpm test`) before asking for review
- If you touched bundled-plugin boundaries in shared code, run the matching inventories:
  - `node --import tsx scripts/check-src-extension-import-boundary.mts --json` for `src/**`
  - `node --import tsx scripts/check-sdk-package-extension-import-boundary.mts --json` for `src/plugin-sdk/**` and `packages/**`
  - `node --import tsx scripts/check-test-helper-extension-import-boundary.mts --json` for `test/helpers/**`
- Shared test helpers must use `src/test-utils/bundled-plugin-public-surface.ts` instead of repo-relative `extensions/**` imports. Keep plugin-local deep mocks inside the owning bundled plugin package.
- If you are using an AI coding agent with OpenAgent skills available, run the `autoreview` skill before opening or updating your PR. Address accepted/actionable findings before asking for review.
- Do not submit refactor-only PRs unless a maintainer explicitly requested that refactor for an active fix or deliverable.
- Ensure CI checks pass
- Keep PRs focused (one thing per PR; do not mix unrelated concerns)
- Describe what & why
- **Include screenshots** — one showing the problem/before, one showing the fix/after (for UI or visual changes)
- Use American English spelling and grammar in code, comments, docs, and UI strings
- Do not edit files covered by `CODEOWNERS` security ownership unless a listed owner authored or explicitly requested the change, or is already reviewing it with you. For governance changes to ownership/review policy itself, explicit direction from an organization owner is also sufficient only when live GitHub organization membership shows `state: active` and `role: admin`; repository `ADMIN`, `viewerCanAdminister`, or bypass permission alone never qualifies. Neither route waives a GitHub-enforced approval rule. Treat those paths as restricted review surfaces, not opportunistic cleanup targets.

## Local commit hook

The normal `pnpm install` setup enables the repository's pre-commit formatting hook
when `core.hooksPath` is unset. Existing hook selections, including an explicitly
empty value, are preserved. Git scopes initialization to the current checkout.
With multiple worktrees, automatic setup requires `extensions.worktreeConfig`;
otherwise Git reports a warning and installation continues without changing hook
settings. The repository owner can enable per-worktree configuration following
[Git's configuration guidance](https://git-scm.com/docs/git-worktree#_configuration_file).

The hook's optional content guard reads a private UTF-8 file selected by
the native Git setting `hooks.blockedLiteralsFile`. Keep one literal per nonempty
line in a file outside the checkout, such as
`~/.config/openclaw/blocked-literals.txt`, then configure this checkout:

```bash
git config --local hooks.blockedLiteralsFile "$HOME/.config/openclaw/blocked-literals.txt"
```

Git metadata is another safe untracked location for the private file. Never put
private rule contents in tracked files or PRs. With no setting, the content guard
is disabled and formatting runs normally; a configured empty path or missing,
unreadable, empty, or invalid file blocks the commit.

When configured, the guard checks case-sensitive literal substrings before
formatting and again after formatting restages files. Each scan checks the full
staged contents of added, modified, and type-changed files, including rename
destinations and unchanged lines within modified files. Docs, tests, generated
files, and binary files are included; no tracked file is exempt.

If the hook blocks a commit, remove the matching content and restage the reported
files. Unchanged historical files and deletions are not scanned. Submodule contents
and symlink targets are not searched. This is a local safeguard, not CI or server
enforcement: bypassing or disabling hooks also bypasses this check.

## Control UI Decorators

The Control UI uses Lit with **legacy** decorators (current Rollup parsing does not support
`accessor` fields required for standard decorators). When adding reactive fields, keep the
legacy style:

```ts
@state() foo = "bar";
@property({ type: Number }) count = 0;
```

The root `tsconfig.json` is configured for legacy decorators (`experimentalDecorators: true`)
with `useDefineForClassFields: false`. Avoid flipping these unless you are also updating the UI
build tooling to support standard decorators.

## AI-Assisted Pull Requests

Built with Codex, Claude, or other AI tools? **Welcome!** No AI-assistance label or disclosure is required.

Please include in your PR:

- [ ] Include a concise **Evidence** section with the most useful validation. Reviewers will inspect the code, tests, and CI rather than relying on the PR body alone.
- [ ] Confirm you understand what the code does
- [ ] Run the `autoreview` skill when available and address accepted/actionable findings

AI PRs are first-class citizens here and follow the same quality and review standards as any other PR.

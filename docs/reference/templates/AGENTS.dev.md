---
summary: "Dev agent AGENTS.md (C-3PO)"
title: "AGENTS.dev template"
read_when:
  - Using the dev gateway templates
  - Updating the default dev agent identity
---

# AGENTS.md - OpenAgent Workspace

This folder is the assistant's working directory, seeded by `openclaw gateway --dev`.

## Your identity is pre-seeded

Unlike a fresh `openclaw onboard` workspace, this `--dev` workspace skips the interactive
BOOTSTRAP.md ritual - it starts with a filled-in identity already in place:

- Your agent identity lives in IDENTITY.md.
- The user profile lives in USER.md.
- Your persona lives in SOUL.md.

Edit any of these directly if you want a different dev identity.

## Backup tip (recommended)

If you treat this workspace as the agent's "memory", make it a git repo (ideally private) so identity
and notes are backed up.

```bash
git init
git add AGENTS.md SOUL.md IDENTITY.md USER.md memory/
git commit -m "Add agent workspace"
```

## Safety defaults

- Don't exfiltrate secrets or private data.
- Don't run destructive commands without asking.
- Before changing config or schedulers (crontab, systemd units, nginx configs, shell rc files), inspect existing state first. Preserve and merge by default.
- Prefer `trash` over `rm` - recoverable beats gone forever.
- Be concise in chat; write longer output to files in this workspace.

## Existing solutions preflight

Before proposing or building a custom system, feature, workflow, tool, integration, or automation, do a brief check for open-source projects, maintained libraries, existing OpenAgent plugins, or free platforms that already solve it well enough. Prefer those when adequate. Build custom only when existing options are unsuitable, too expensive, unmaintained, unsafe, non-compliant, or the user explicitly asks for custom. Avoid paid-service recommendations unless the user explicitly approves spend. Keep this lightweight: a preflight gate, not a broad research assignment.

## Daily memory (recommended)

- Keep a short daily log at memory/YYYY-MM-DD.md (create memory/ if needed).
- Use runtime-provided startup context first. Read today + yesterday yourself only when the startup context does not already include them.
- Before writing memory files, read them first; write only concrete updates, never empty placeholders.
- Capture durable facts, preferences, and decisions; avoid secrets.

## Automations (optional)

- A scheduled automation's scratch can hold a tiny task checklist; keep it small.

## Tools

Skills define how tools work. Keep environment-specific details here so shared skills can update independently without exposing your local setup.

Example placeholders (replace or remove them):

```markdown
- SSH: dev-server -> 192.168.1.100, user admin
- TTS: preferred voice "Nova"; default speaker Office
```

## Customize

- Add your preferred style, rules, and "memory" here.

---

## Related

- [AGENTS.md template](/reference/templates/AGENTS)
- [Default AGENTS.md](/reference/AGENTS.default)

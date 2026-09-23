---
summary: "CLI reference for `openagent directory` (self, peers, groups)"
read_when:
  - You want to look up contacts/groups/self ids for a channel
  - You are developing a channel directory adapter
title: "Directory"
---

# `openagent directory`

Directory lookups for channels that support them: contacts/peers, groups, and "me" (self).

Results are meant to be pasted into other commands, especially `openagent message send --target ...`.

## Common flags

- `--channel <name>`: channel id or alias. Required when several channels are configured, and auto-selected when only one is configured.
- `--account <id>`: account id (default: channel default)
- `--json`: output JSON
- `--limit <n>`: positive integer cap for peers/groups/members listings

Omit `--account` to select the channel default. Explicitly empty and whitespace-only account
values fail with `--account must not be blank` before account setup or lookup.

`--limit` requires a positive integer. Omit `--limit` to use the selected channel plugin's default.
Explicitly empty and whitespace-only values are rejected.

Default output renders IDs and names in a table. Empty list results name the channel and account
that were queried. JSON list output uses an empty array (`[]`). Failures exit nonzero and use the
canonical `{ "ok": false, "error": { "type": "cli_error", "message": "..." } }` envelope in
JSON mode.

## Notes

- For many channels, results are config-backed (allowlists / configured groups) rather than a live provider directory.
- Before a live lookup, OpenAgent resolves configured SecretRefs only for the selected channel and account. Resolved credentials remain runtime-only. Plugin installation and auto-enable writes preserve the authored references without persisting runtime defaults.
- An already-installed channel plugin can lack directory support. In that case the command reports the unsupported operation. It does not try to reinstall or upgrade the plugin to add support.

## Using results with `message send`

```bash
openagent directory peers list --channel discord --query "jane"
openagent message send --channel discord --target user:123456789012345678 --message "hello"
```

## ID formats by channel

| Channel  | Target id format                                       |
| -------- | ------------------------------------------------------ |
| Discord  | `user:<id>` and `channel:<id>`                         |
| Telegram | `@username` or numeric chat id; groups use numeric ids |

## Self ("me")

```bash
openagent directory self --channel discord
```

A channel may legitimately return no self identity. This is a successful empty result (exit code
`0`), not a failed lookup. Channels without a self resolver report that the channel does not expose
a self identity, without suggesting account troubleshooting:

```json
{
  "status": "unavailable",
  "channel": "telegram",
  "accountId": "default",
  "reason": "self-identity-unsupported"
}
```

When a channel implements self lookup but returns no identity, the text output names the channel and
account and suggests checking its configuration and authentication. JSON callers can distinguish
that case by its reason:

```json
{
  "status": "unavailable",
  "channel": "discord",
  "accountId": "default",
  "reason": "plugin-returned-no-self-identity"
}
```

## Peers (contacts/users)

```bash
openagent directory peers list --channel discord
openagent directory peers list --channel discord --query "name"
openagent directory peers list --channel discord --limit 50
```

## Groups

```bash
openagent directory groups list --channel discord
openagent directory groups list --channel discord --query "work"
openagent directory groups members --channel discord --group-id <id>
```

`groups members` requires a non-blank `--group-id`. Empty or whitespace-only IDs fail before plugin setup or lookup.

## Related

- [CLI reference](/cli)

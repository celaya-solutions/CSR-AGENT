---
summary: "CLI reference for `openagent devices` (device pairing + token rotation/revocation)"
read_when:
  - You are approving device pairing requests
  - You need to rotate or revoke device tokens
title: "Devices"
---

# `openagent devices`

Manage device pairing requests and device-scoped tokens.

## Common options

- `--url <url>`: Gateway WebSocket URL (defaults to `gateway.remote.url` when configured)
- `--token <token>`: Gateway token (if required)
- `--password <password>`: Gateway password (password auth)
- `--timeout <ms>`: RPC timeout
- `--json`: JSON output (recommended for scripting)

<Warning>
When you set `--url`, the CLI does not fall back to config or environment credentials. Pass `--token` or `--password` explicitly, or the command errors.
</Warning>

## Commands

### `openagent devices list`

List pending pairing requests and paired devices.

```bash
openagent devices list
openagent devices list --json
```

For a pending request on an already-paired device, the output shows requested access next to the device's current approved access, so scope/role upgrades are visible instead of looking like a lost pairing.

Paired device display names use this precedence: operator label (`operatorLabel` from `devices rename`), then client `displayName`, then `clientId`, then `deviceId`. Node approval notices printed by `devices` commands use the operator label when one is set.

### `openagent devices approve [requestId] [--latest]`

Approve a pending pairing request by exact `requestId`. Omitting `requestId`, or passing `--latest`, only previews the newest pending request and exits (code 1); rerun with the exact request ID to approve.

The printed approval command keeps your active profile or container, explicit Gateway URL, nondefault timeout, and JSON output mode. Token and password option values are omitted; supply the same credentials again when the preview asks you to reuse those options.

```bash
openagent devices approve
openagent devices approve <requestId>
openagent devices approve --latest
```

<Note>
If a device retries pairing with changed auth details (role, scopes, or public key), OpenAgent supersedes the previous pending entry with a new `requestId`. Run `openagent devices list` right before approval to get the current id.
</Note>

Approval behavior:

- If the device is already paired and requests broader scopes or role, OpenAgent keeps the existing approval and creates a new pending upgrade request. Compare `Requested` vs `Approved` in `openagent devices list`, or preview with `--latest`, before approving.
- Approving a `node` role or other non-operator role requires `operator.admin`. `operator.pairing` is enough for operator-device approvals, but only when the requested operator scopes stay within the caller's own scopes. See [Operator scopes](/gateway/operator-scopes).
- If `gateway.nodes.pairing.autoApproveCidrs` is configured, first-time `role: node` requests from matching client IPs can be auto-approved before they appear in this list. Disabled by default; never applies to operator/browser clients or upgrade requests.
- `gateway.nodes.pairing.sshVerify` (on by default) auto-approves first-time `role: node` requests when the gateway verifies the device key over SSH to the node host. Requests may therefore resolve to approved shortly after appearing. Set `sshVerify: false` to disable SSH verification; this is independent of `autoApproveCidrs`, so unset that too for manual-only pairing.

### `openagent devices reject <requestId>`

Reject a pending device pairing request.

```bash
openagent devices reject <requestId>
```

### `openagent devices join-code`

Mint a single-use node onboarding URL with administrator access to the
Gateway. Paste the printed `npx openclaw connect <url>` command on the machine
to enroll.

```bash
openagent devices join-code
openagent devices join-code --json
```

Join-code creation and redemption are core Gateway operations; no pairing
plugin needs to be enabled. The URL must be reachable from the joining machine.
Remote join URLs require a TLS Gateway endpoint. Explicitly configured loopback
endpoints can use HTTP, provided the joining machine can reach that loopback
endpoint, for example through a local tunnel.

With only the default loopback bind and no advertised endpoint, URL discovery
refuses to mint a link. Configure a reachable secure endpoint first; see
[Gateway deployments that cannot host nodes](/nodes/node-host#gateway-deployments-that-cannot-host-nodes).
Plaintext LAN pairing can use a setup code directly instead of an HTTP join URL.
See [Connect a machine](/cli/connect).

### `openagent devices remove <deviceId>`

Remove one paired device entry.

```bash
openagent devices remove <deviceId>
openagent devices remove <deviceId> --json
```

A caller authenticated with a paired device token can remove only its **own** device entry. Removing another device requires `operator.admin`.

### `openagent devices rename --device <id> --name <label>`

Assign an operator label to a paired device. Labels are owner-side state: they survive pairing repairs and role re-approvals, and they do not change the stable `deviceId`.

```bash
openagent devices rename --device <deviceId> --name "Kitchen Mac"
openagent devices rename --device <deviceId> --name "Kitchen Mac" --json
```

- `--name` is required, trimmed, non-empty, and capped at 64 characters.
- Display surfaces (CLI list, Control UI inventory) prefer the operator label over the client-reported display name.
- A non-admin paired-device caller can rename only its **own** device. Renaming another device requires `operator.admin`.

### `openagent devices clear --yes [--pending]`

Clear paired devices in bulk. Gated by `--yes`.

```bash
openagent devices clear --yes
openagent devices clear --yes --pending
openagent devices clear --yes --pending --json
```

`--pending` also rejects all pending pairing requests.

### `openagent devices rotate --device <id> --role <role> [--scope <scope...>]`

Rotate a device token for a role, optionally updating its scopes.

```bash
openagent devices rotate --device <deviceId> --role operator --scope operator.read --scope operator.write
```

- The target role must already exist in that device's approved pairing contract; rotation cannot mint a new unapproved role.
- Omitting `--scope` retains the target token's current scopes. Passing explicit `--scope` values replaces that scope set, within the device's approved baseline, for future cached-token reconnects.
- Pass `--no-scopes` to request an empty scope set. It cannot be combined with `--scope`.
- A non-admin paired-device caller can rotate only its **own** device token, and the target scope set must stay within the caller's own operator scopes; rotation cannot mint or preserve a broader token than the caller already has.

Returns rotation metadata as JSON. If the caller rotates its own token while authenticated with that device token, the response includes the replacement token so the client can persist it before reconnecting. Shared-secret callers and callers rotating another device never receive the bearer token.

When Doctor reports a legacy node token carrying operator scopes, use its explicit recovery command:

```bash
openagent devices rotate --device <deviceId> --role node --no-scopes
```

This recovery requires `operator.admin` and preserves the device's operator pairing and approved scopes. The Gateway removes only a local cached node token that matches the retired legacy token, in the same commit as rotation. For a node host using a separate state directory, provide valid shared Gateway authentication and restart the node to refresh its cache. A retired device token alone cannot authenticate the reconnect.

### `openagent devices revoke --device <id> --role <role>`

Revoke a device token for a role.

```bash
openagent devices revoke --device <deviceId> --role node
```

A non-admin paired-device caller can revoke only its **own** device token. Revoking another device's token requires `operator.admin`. The target scope set must also fit within the caller's own operator scopes; pairing-only callers cannot revoke admin/write operator tokens.

## Notes

- These commands require `operator.pairing` (or `operator.admin`) scope. Non-operator device roles always require `operator.admin`; see [Operator scopes](/gateway/operator-scopes).
- Token rotation and revocation stay inside the device's approved pairing role set and scope baseline. A stray cached token entry does not grant a token-management target.
- Removing a device or revoking its node token also clears node runtime state. A worker cleanup error does not keep affected connections authorized or open.
- For operator tokens, the CLI first reads the pairing list, then requests pairing plus the target token's scopes (or explicit rotate scopes). If the target is not visible, it requests admin access for cross-device management. A narrowed token does not inherit a broader device approval baseline; the caller must already be authorized for the requested scopes.
- For paired-device token sessions, cross-device management (`remove`, `rename`, `rotate`, `revoke`) is self-only unless the caller has `operator.admin`.
- Token rotation returns a new token (sensitive) — treat it like a secret.
- If pairing scope is unavailable on local loopback and no explicit `--url` is passed, `list`/`approve` can fall back to local pairing state.

## Token drift recovery checklist

Use this when Control UI or other clients keep failing with `AUTH_TOKEN_MISMATCH`, `AUTH_DEVICE_TOKEN_MISMATCH`, or `AUTH_SCOPE_MISMATCH`.

1. Confirm current gateway token source:

   ```bash
   openagent gateway auth-token --show
   ```

   Run the command in an interactive terminal on the Gateway host and treat its output as a secret.

2. List paired devices and identify the affected device id:

   ```bash
   openagent devices list
   ```

3. Rotate the operator token for the affected device:

   ```bash
   openagent devices rotate --device <deviceId> --role operator
   ```

4. If rotation is not enough, remove the stale pairing and approve again:

   ```bash
   openagent devices remove <deviceId>
   openagent devices list
   openagent devices approve <requestId>
   ```

5. Retry the client connection with the current shared token/password.

Notes:

- Normal reconnect auth precedence: explicit shared token/password first, then explicit `deviceToken`, then stored device token, then bootstrap token.
- Trusted `AUTH_TOKEN_MISMATCH` recovery can temporarily send both the shared token and the stored device token together for one bounded retry.
- `AUTH_SCOPE_MISMATCH` means the device token was recognized but does not carry the requested scope set; fix the pairing/scope approval contract before changing shared gateway auth.

Related:

- [Dashboard auth troubleshooting](/web/dashboard#if-you-see-unauthorized-1008)
- [Gateway troubleshooting](/gateway/troubleshooting#dashboard-control-ui-connectivity)

## Paperclip / `openclaw_gateway` first-run approval

Paperclip agents connecting through the `openclaw_gateway` adapter go through the same first-run device pairing approval as any other new client. If Paperclip reports `openclaw_gateway_pairing_required`, approve the pending device and retry.

```bash
openagent devices approve --latest
```

The preview prints the exact `openagent devices approve <requestId>` command; verify the details, then rerun that command with the request ID to approve it. For a remote gateway or explicit credentials, pass the same options while previewing and approving:

```bash
openagent devices approve --latest --url <gateway-ws-url> --token <gateway-token>
```

To avoid re-approving after every restart, configure a persistent `adapterConfig.devicePrivateKeyPem` in Paperclip instead of letting it generate a new ephemeral device identity each run:

```json
{
  "adapterConfig": {
    "devicePrivateKeyPem": "<ed25519-private-key-pkcs8-pem>"
  }
}
```

If approval keeps failing, run `openagent devices list` first to confirm a pending request exists.

## Related

- [CLI reference](/cli)
- [Nodes](/nodes)
- [`openagent qr`](/cli/qr) — generate the mobile-node bootstrap QR and setup code

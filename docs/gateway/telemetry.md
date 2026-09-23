---
summary: "Operator-configured update checks, optional anonymous feature statistics, and privacy controls"
title: "Usage telemetry and update checks"
read_when:
  - Checking what OpenAgent sends and what the receiver stores
  - Deciding whether to share anonymous feature statistics
  - Enabling or disabling anonymous feature statistics
  - Disabling all automatic update-check requests
---

**OpenAgent ships with no telemetry or update-check endpoint.** Nothing is sent
until an operator sets `OPENCLAW_TELEMETRY_ENDPOINT` to a server they run. With
an endpoint configured, the Gateway sends a daily request asking whether a newer
version exists. It includes the OpenAgent version, operating system, Node.js
version, CPU architecture, and request surface.
Anonymous feature statistics are opt-in on top of that.
This page describes update-check telemetry, not requests made by configured
providers, channels, or other services.

Anonymous feature statistics describe configured channels and providers, plugin
inventory, and a retained session-creation count. They are **off by default**.
When you enable them, they ride along with that same daily update check instead
of adding a second request.

These reports do not measure individual plugin invocations, messages, model
requests, or active users.

Declining is a completely normal choice and changes nothing about how OpenAgent
works for you.

## Inspect what is sent

Run this command before or after changing your preference:

```bash
openclaw telemetry show
```

Add `--json` to get the same state and payload as one machine-readable
document.

The output shows whether anonymous feature statistics are enabled, why they are
enabled or disabled (`no-endpoint` when no endpoint is configured), the request endpoint, and the last successful check. When
anonymous feature statistics are enabled, it prints a JSON payload preview built
in the CLI process. It does not retrieve a payload from the running Gateway.
When only anonymous feature statistics are disabled, it shows the update-only request
and its `User-Agent` header instead. When automation or update-check policy
disables all requests, it shows `Request: none` with the reason (`request: null`
in JSON).
The preview describes the client request only. It cannot show server-derived
location information.

## Daily update check

With `OPENCLAW_TELEMETRY_ENDPOINT` set, the request is:

```http
GET <OPENCLAW_TELEMETRY_ENDPOINT>
User-Agent: openclaw/2026.8.2 (darwin; node/26.0.1; arm64; gateway)
```

The `User-Agent` contains the OpenAgent version, operating system, Node.js
version, CPU architecture, and whether the request came from the Gateway or
CLI. It has no request body, install identifier, machine identifier, or random
tracking identifier.

The endpoint responds with the latest version and, optionally, a short
operator-facing note. OpenAgent displays an available update and its note through
the existing update notice. Unreachable services, timeouts, oversized or invalid responses,
and other failed checks do not interrupt startup or normal operation.

A successful response and its timestamp are cached in the existing shared state
database. Startup reuses the cached result for the next 24 hours, and a running
Gateway checks again during normal maintenance with a small random delay. Failed
checks do not count as successful daily checks.

Set `OPENCLAW_TELEMETRY_ENDPOINT` to the complete endpoint URL of a service you
operate. Leave it unset to send nothing.

<a id="optional-feature-statistics" />

## Optional anonymous feature statistics

Anonymous feature statistics are **off by default**. When an endpoint is configured, interactive setup can offer a one-time
opt-in with **No thanks** selected by default; guided Quick Start skips that
prompt. OpenAgent records a prompt response so setup does not ask again.
Non-interactive and scripted installations do not opt in automatically, but
operators can explicitly enable anonymous feature statistics with `openclaw telemetry on` or
`telemetry.enabled: true`. The enabled setting, not the presence of a prompt
response, controls whether anonymous feature statistics are included.

When you explicitly enable anonymous feature statistics, the same daily request becomes a
`POST` with a JSON payload in this shape (values are illustrative):

```json
{
  "schema": 1,
  "version": "2026.8.2",
  "platform": "darwin-arm64",
  "node": "26.0.1",
  "surface": "gateway",
  "features": {
    "channels": ["discord", "telegram"],
    "providerFamilies": ["anthropic", "openai"],
    "plugins": ["browser", "codex"],
    "pluginsEnabled": 9,
    "sessionsLast24h": 14
  }
}
```

| Field                       | Meaning                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `schema`                    | Payload format version, currently `1`.                                                            |
| `version`                   | Installed OpenAgent version.                                                                      |
| `platform`                  | Operating system and CPU architecture.                                                            |
| `node`                      | Running Node.js version.                                                                          |
| `surface`                   | Request surface: `gateway` or `cli`; the CLI preview uses `gateway`.                              |
| `features.channels`         | Configured, not explicitly disabled channel IDs backed by public plugins in the inventory.        |
| `features.providerFamilies` | Public provider IDs from configuration, auth profiles, and configured model references.           |
| `features.plugins`          | Public plugin IDs from the enabled inventory, sorted alphabetically.                              |
| `features.pluginsEnabled`   | Total plugins in that inventory, including plugins not named in `features.plugins`.               |
| `features.sessionsLast24h`  | Retained session-creation events timestamped within the preceding 24 hours, not session activity. |

With an active plugin registry, the inventory includes enabled, loaded plugins
whose code was imported, plus loaded bundle-format plugins. Without that
registry, it falls back to configured manifest enablement. Neither path records
whether a plugin was invoked or a configured channel or provider handled work.

Named plugins must be bundled, trusted official installs, or match the official
plugin catalog. Private plugin identities are not named. Names are also filtered
and deduplicated, and the service validates them independently. The difference
between `features.pluginsEnabled` and the number of reported names is therefore
not a reliable count of private plugins.

The session count depends on locally recorded creation events that remain in
the bounded event store. Missing or unreadable state produces zero. It is not
a count of active sessions, messages, or all sessions that existed that day.

The sender and `openclaw telemetry show` use the same payload builder, but their
plugin registry, configuration, and collection time can differ. The CLI preview
is not a guarantee of the exact next Gateway payload.

Reports contain no user, account, install, or device identifier. Repeated reports
are not unique installations or users.

<a id="what-is-never-collected" />

### What is not sent or stored

Neither the update-check `User-Agent` nor the body containing anonymous feature
statistics includes message content, prompts, model names, API keys, credentials, secret references,
file paths, hostnames, account identifiers, user identifiers, or installation
and machine identifiers. OpenAgent does not create a random UUID or other
persistent client identifier for these requests.

What the receiving service stores, including connection IP addresses, depends
on the service you configure.

<a id="turn-feature-statistics-on-or-off" />

## Turn anonymous feature statistics on or off

Enable or disable anonymous feature statistics at any time:

```bash
openclaw telemetry on
openclaw telemetry off
```

You can also configure the same preference directly:

```json5
{
  telemetry: {
    enabled: false,
  },
}
```

Set `DO_NOT_TRACK=1` or `DO_NOT_TRACK=true` to force anonymous feature statistics off,
even when `telemetry.enabled` is `true`. `DO_NOT_TRACK` does not disable the
daily update check: OpenAgent sends the update-only `GET` request without a
body containing anonymous feature statistics.

## Automated environments

Continuous integration runs are not special-cased. Because only an
operator-configured endpoint is ever contacted, a pipeline that sets
`OPENCLAW_TELEMETRY_ENDPOINT` is deliberately reporting, and a pipeline that
leaves it unset sends nothing.

## Disable every automatic update request

Leaving `OPENCLAW_TELEMETRY_ENDPOINT` unset already sends nothing. To stop
requests even when an endpoint is configured, disable the startup update check:

```json5
{
  update: {
    checkOnStart: false,
  },
}
```

This stops both tiers and every automatic update request: no update request,
anonymous feature statistics, or update notice, even when `update.auto.enabled` is `true`.
Setting `OPENCLAW_NO_AUTO_UPDATE=1` also prevents automatic update requests.
Explicit update commands remain available when you choose to run them.

See [Configuration reference](/gateway/config-observability#telemetry) for
the full `telemetry` configuration and
[Update configuration](/gateway/config-runtime#update) for the
automatic update-check controls.

---
summary: "Node discovery and transports (wide-area DNS-SD, Tailscale, SSH) for finding the Gateway"
read_when:
  - Implementing or changing DNS-SD discovery/advertising
  - Adjusting remote connection modes (direct vs SSH)
  - Designing node discovery + pairing for remote nodes
title: "Discovery and transports"
---

OpenAgent has two related but distinct discovery problems:

1. **Operator remote control**: a client such as the CLI or Control UI controlling a Gateway running elsewhere.
2. **Node pairing**: node hosts finding a Gateway and pairing securely.

All network discovery/advertising lives in the **Gateway**
(`openagent gateway`); clients are consumers only.

## Terms

- **Gateway**: a single long-running process that owns state (sessions,
  pairing, node registry) and runs channels. Most setups use one per host;
  isolated multi-gateway setups are possible.
- **Gateway WS (control plane)**: the WebSocket endpoint on `127.0.0.1:18789`
  by default; bind it to LAN/tailnet via `gateway.bind`.
- **Direct WS transport**: a LAN/tailnet-facing Gateway WS endpoint (no SSH).
- **SSH transport (fallback)**: remote control by forwarding
  `127.0.0.1:18789` over SSH.

Protocol details: [Gateway protocol](/gateway/protocol).

## Why direct and SSH both exist

- **Direct WS** is the best UX on the same network and within a tailnet:
  pairing tokens and ACLs owned by the Gateway, and no shell access required.
- **SSH** is the universal fallback: works anywhere you have SSH access, even
  across unrelated networks, and needs no new inbound port besides SSH.

## Discovery inputs

### 1) Wide-area DNS-SD

OpenAgent can publish and browse the Gateway beacon through a configured
unicast DNS-SD domain, so discovery can work across networks. Use
[`openagent dns`](/cli/dns) to set up the zone and
[`openagent gateway discover`](/cli/gateway/discovery) to browse it. This build
does not include LAN multicast (mDNS) advertising.

#### Service beacon details

- Service type: `_openclaw-gw._tcp` (Gateway transport beacon).
- TXT keys (non-secret):

  | Key                         | Notes                                                                                          |
  | --------------------------- | ---------------------------------------------------------------------------------------------- |
  | `role=gateway`              | Always present.                                                                                |
  | `transport=gateway`         | Always present.                                                                                |
  | `displayName=<name>`        | Operator-configured display name.                                                              |
  | `gatewayPort=18789`         | Gateway WS + HTTP port.                                                                        |
  | `gatewayTls=1`              | Only when TLS is enabled.                                                                      |
  | `gatewayTlsSha256=<sha256>` | Only when TLS is enabled and a fingerprint is available.                                       |
  | `tailnetDns=<magicdns>`     | Optional hint; auto-detected when Tailscale is available.                                      |
  | `sshPort=<port>`            | Present only when `discovery.mdns.mode="full"`; omitted (SSH defaults to `22`) in `"minimal"`. |
  | `cliPath=<path>`            | Same `discovery.mdns.mode="full"` gate as `sshPort`; a remote-install hint for the CLI path.   |

Security notes:

- DNS-SD TXT records are **unauthenticated**. Clients must treat TXT values as
  UX hints only.
- Routing (host/port) should prefer the **resolved service endpoint**
  (SRV + A/AAAA) over TXT-provided `tailnetDns` or `gatewayPort`.
- TLS pinning must never let an advertised `gatewayTlsSha256` override a
  previously stored pin.

Overrides:

- `discovery.mdns.mode` in `openclaw.json`: `"minimal"` (default), `"full"`
  (adds `cliPath`/`sshPort` to the beacon), or `"off"`.
- `gateway.bind` in `~/.openclaw/openclaw.json` controls the Gateway bind mode.
- `OPENCLAW_SSH_PORT` overrides the advertised SSH port (only takes effect
  when `discovery.mdns.mode="full"`).
- `OPENCLAW_TAILNET_DNS` publishes a `tailnetDns` hint (MagicDNS).
- `OPENCLAW_CLI_PATH` overrides the advertised CLI path.

### 2) Tailnet (cross-network)

For Gateways on different physical networks, the recommended direct target is
a Tailscale MagicDNS name (preferred) or a stable tailnet IP.

If the Gateway detects it is running under Tailscale, it publishes
`tailnetDns` as an optional hint for clients (including wide-area beacons).
Prefer a trusted MagicDNS name over a raw Tailscale IP so the name resolves to
the current address.

Discovery hints never relax transport security on tailnet/public routes:

- Remote nodes still require a secure first-time tailnet/public connect path
  (`wss://` or Tailscale Serve/Funnel).
- A discovered raw tailnet IP is a routing hint, not permission to use
  plaintext remote `ws://`.
- Private LAN direct-connect `ws://` remains supported.

### 3) Manual / SSH target

When there is no direct route (or direct is disabled), clients can always
connect via SSH by forwarding the loopback Gateway port. See
[Remote access](/gateway/remote).

## Transport selection (client policy)

Discovery-based client selection follows this policy:

1. If a paired direct endpoint is configured and reachable, use it.
2. Else, if discovery finds a Gateway in the configured wide-area domain, offer
   setup for that candidate. Apply the client's trust policy before saving a
   direct endpoint; discovery alone is not authorization.
3. Else, if a tailnet DNS/IP is configured, try direct. On tailnet/public
   routes, direct means a secure endpoint, not plaintext remote `ws://`.
4. Else, fall back to SSH.

## Pairing and auth (direct transport)

The Gateway is the source of truth for node/client admission:

- Pairing requests are created/approved/rejected in the Gateway (see
  [Gateway pairing](/gateway/pairing)).
- The Gateway enforces auth (token/keypair), scopes/ACLs (it is not a raw
  proxy to every method), and rate limits.

## Related

- [Remote access](/gateway/remote)
- [Tailscale](/gateway/tailscale)

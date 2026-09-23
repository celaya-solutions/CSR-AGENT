# OpenAgent

```
Document:    OpenAgent README
Version:     v1.0.0
Author:      Celaya Solutions
Contact:     hello@celayasolutions.com
Date:        2026-09-13
SHA256:      [pending]
Chain:       n/a
Tx:          [not anchored]
License:     MIT (see LICENSE)
```

OpenAgent is the course edition of an open-source AI assistant. It runs on
your own machine and meets you in Discord and Telegram, or in the browser
Control UI and the terminal.

One local process, the **Gateway**, holds everything together: your sessions,
your tools, and your channel connections. The CLI, the Control UI, and the TUI
are all clients of it. Running it as a personal assistant or as a shared team
deployment is a matter of configuration, not a different product.

This repository is a teaching fork. You build it from source, read it, change
it, and run your own copy.

## Requirements

- Node.js 24.16+ or 26.1+ (Node 26 recommended)
- pnpm (the repository pins its own version)
- git

## Build and run

The repository is a pnpm workspace. Plain `npm install` at the root is not
supported.

```bash
git clone https://github.com/celaya-solutions/CSR-AGENT.git
cd CSR-AGENT
pnpm install
pnpm build
pnpm ui:build
```

Then set up your assistant and start the Gateway:

```bash
pnpm openclaw onboard --install-daemon
```

Onboarding checks your model access, creates a workspace, and configures the
Gateway. When it finishes:

```bash
pnpm openclaw gateway status
pnpm openclaw dashboard
```

The last command opens the Control UI. Send a message there to confirm the
assistant is working.

Always run the CLI through `pnpm openclaw ...` or `pnpm dev`. These wrappers
handle build freshness and process setup; running the TypeScript entry point
directly will not.

## Where to read next

Documentation lives in [`docs/`](docs) in this repository. Run `pnpm docs:list`
to find a page, or `pnpm docs:dev` to browse them locally. Good starting points:

| Goal                        | Start here                                                 |
| --------------------------- | ---------------------------------------------------------- |
| Understand the moving parts | [`docs/concepts`](docs/concepts)                           |
| Pick and configure a model  | [`docs/providers`](docs/providers)                         |
| Connect a chat app          | [`docs/channels`](docs/channels)                           |
| Add tools, skills, plugins  | [`docs/tools`](docs/tools), [`docs/plugins`](docs/plugins) |
| Operate the Gateway         | [`docs/gateway`](docs/gateway)                             |
| Look up a command           | [`docs/cli`](docs/cli)                                     |

## Security

Treat every inbound message as untrusted input. Channels that accept direct
messages pair unknown senders by default; approve one with
`pnpm openclaw pairing approve <channel> <code>`.

Tools run on your host unless you turn on sandboxing. Read
[`docs/gateway/security`](docs/gateway/security) and
[`docs/gateway/sandboxing`](docs/gateway/sandboxing) before you let other people
reach your Gateway or expose it to the internet.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE) © Celaya Solutions. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for incorporated or adapted
code.

OpenAgent is a derivative of OpenClaw and is not endorsed by the OpenClaw
Foundation. See [NOTICE.md](NOTICE.md).

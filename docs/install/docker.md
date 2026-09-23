---
summary: "Optional Docker-based setup and onboarding for OpenAgent"
read_when:
  - You want a containerized Gateway instead of local installs
  - You are validating the Docker flow
  - You are migrating from ClawDock shell helpers
title: "Docker"
---

Docker is **optional**. Use it for an isolated, throwaway Gateway environment or a host without local installs. If you already develop on your own machine, use the normal install flow instead.

The default Docker sandbox backend uses only the `docker` CLI. Set the backend to `"podman"` to select native Podman directly. Sandboxing is off by default and does not require the Gateway itself to run in a container. An SSH sandbox backend is also available; see [Sandboxing](/gateway/sandboxing).

Hosting multiple users? See [Multi-tenant hosting](/gateway/multi-tenant-hosting) for the one-cell-per-tenant model.

## Prerequisites

- Docker Desktop (or Docker Engine) + Docker Compose v2
- At least 6 GB RAM for the local source image build
- Enough disk for images and logs
- On a VPS/public host, review [Security hardening for network exposure](/gateway/security), especially the Docker `DOCKER-USER` firewall chain

## Containerized Gateway

<Steps>
  <Step title="Build the image">
    From the repo root:

    ```bash
    ./scripts/docker/setup.sh
    ```

    This builds the Gateway image locally from your checkout as `openclaw:local`.
    OpenAgent publishes no prebuilt images; every image comes from a source build.

  </Step>

  <Step title="Airgapped rerun">
    On offline hosts, build the image on a connected machine, `docker save` it,
    then transfer and load it first:

    ```bash
    docker load -i openclaw-image.tar
    export OPENCLAW_IMAGE="openclaw:local"
    ./scripts/docker/setup.sh --offline
    ```

    `--offline` verifies `OPENCLAW_IMAGE` already exists locally, disables implicit Compose pulls/builds, then runs the normal flow: `.env` sync, permission fixes, onboarding, Gateway config sync, Compose startup.

    If `OPENCLAW_SANDBOX=1`, offline setup also checks the configured default and per-agent sandbox images on the daemon behind `OPENCLAW_DOCKER_SOCKET`, including the browser-contract label on Docker-backed browser images. If a required image is missing or stale, setup exits without changing sandbox config rather than reporting a broken success.

  </Step>

  <Step title="Complete onboarding">
    The setup script runs onboarding automatically:

    - prompts for provider API keys
    - generates a Gateway token and writes it to `.env`
    - creates the legacy auth-profile secret key directory
    - starts the Gateway via Docker Compose

    Pre-start onboarding and config writes run through `openclaw-gateway` directly (with `--no-deps --entrypoint node`), since `openclaw-cli` shares the Gateway's network namespace and only works once the Gateway container exists.

  </Step>

  <Step title="Open the Control UI">
    Open `http://127.0.0.1:18789/` and paste the token written to `.env` into Settings. If you switched the container to password auth, use that password instead.

    Need the URL again?

    ```bash
    docker compose run --rm openclaw-cli dashboard --no-open
    ```

    With a custom `OPENCLAW_GATEWAY_PORT`, replace port `18789` in the printed URL with your host port before opening it in the browser; keep the rest of the URL intact. Dashboard commands inside either container use the internal listener port.

  </Step>

  <Step title="Configure channels (optional)">
    ```bash
    # Telegram
    docker compose run --rm openclaw-cli channels add --channel telegram --token "<token>"

    # Discord
    docker compose run --rm openclaw-cli channels add --channel discord --token "<token>"
    ```

    Docs: [Telegram](/channels/telegram), [Discord](/channels/discord)

  </Step>
</Steps>

### Using the Control UI browser

The [Control UI Browser panel](/web/control-ui/panels#browser-panel) displays a
browser controlled by the Gateway. It is separate from the browser on your laptop
or phone that opens the dashboard. For a local managed browser with a Docker
Gateway, Chromium must be available **inside the Gateway container**.

Bake Chromium into the image at build time:

```bash
OPENCLAW_IMAGE=openclaw:local OPENCLAW_INSTALL_BROWSER=1 ./scripts/docker/setup.sh
```

For an existing Compose installation, rebuild with the same option and recreate
the Gateway using the same Compose files and overlays as your current
deployment. Keep your existing volumes, ports, and other settings. Do not rerun
setup with an empty shell environment: setup rewrites `.env` from the current
shell and defaults.

An existing home volume or bind mount covering `/home/node/.cache/ms-playwright`
can hide the image's bundled Chromium. If browser discovery still fails after the
rebuild, check those mounts. Preserve the data, then either provision
Chromium in the mounted home or adjust the mounts to leave the image's browser
cache visible; recreating the container does not refresh a populated home volume.

This build-time option installs Chromium and Xvfb; setting it on
an already-built container does not install a browser.

The image supplies Chromium, not a replacement for your browser configuration:

- Keep browser control enabled (`browser.enabled`). Use a local managed profile
  such as `openclaw` for the container's Chromium, not an extension, attach-only,
  or remote-CDP profile intended for another browser.
- OpenAgent auto-detects the image's Playwright-managed Chromium on Linux. An
  explicit `browser.executablePath` or profile executable path must point to a
  binary inside the container; a path from your laptop will not work there.
- A headless container needs headless browser operation. Check explicit
  `browser.headless`, profile headless settings, and `OPENCLAW_BROWSER_HEADLESS`
  overrides if startup reports a missing display. See [Browser configuration](/tools/browser-control).
- Connect with `operator.admin` access to a Gateway advertising `browser.request`.
  Open **+ → Browser** in the Chat side panel, navigate to a page, and confirm that
  its snapshot loads and navigation works. Loading the dashboard alone does not
  verify that Chromium can start.

This is not the separate [sandboxed browser](/gateway/sandboxing#sandboxed-browser)
container used by sandboxed agent sessions. Baking Chromium into the Gateway
image does not build or configure that sandbox image.

### Headless bootstrap

For an unattended container host, put provider, Gateway, and channel credentials in the Compose `.env` file so both the one-shot bootstrap container and the long-running Gateway receive the same values:

```bash
OPENAI_API_KEY=<provider-key>
OPENCLAW_GATEWAY_TOKEN=<gateway-token>
TELEGRAM_BOT_TOKEN=<bot-token>
```

Run onboarding and channel provisioning without a pseudo-TTY, then start the Gateway:

```bash
docker compose run -T --rm --no-deps --entrypoint node openclaw-gateway \
  dist/index.js onboard --non-interactive --accept-risk --skip-health \
  --mode local \
  --auth-choice openai-api-key \
  --secret-input-mode ref \
  --gateway-auth token \
  --gateway-token-ref-env OPENCLAW_GATEWAY_TOKEN \
  --skip-channels \
  --no-install-daemon
docker compose run -T --rm --no-deps --entrypoint node openclaw-gateway \
  dist/index.js channels add --channel telegram --use-env
docker compose up -d openclaw-gateway
```

The channel command fails before changing config if a plugin-declared environment variable is missing. Keep `TELEGRAM_BOT_TOKEN` in `.env` after bootstrap: `--use-env` leaves credential lookup to the environment without copying the token into `openclaw.json`, and the running Gateway needs the same variable. When channel config changes after startup, the Gateway's config watcher hot-reloads the affected channel automatically.

See [`openclaw channels`](/cli/channels) for credential-flag alternatives and other channel plugins.

### Manual flow

```bash
BUILD_GIT_COMMIT="$(git rev-parse HEAD)"
BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker build \
  --build-arg "GIT_COMMIT=${BUILD_GIT_COMMIT}" \
  --build-arg "OPENCLAW_BUILD_TIMESTAMP=${BUILD_TIMESTAMP}" \
  -t openclaw:local -f Dockerfile .
docker compose run --rm --no-deps --entrypoint node openclaw-gateway \
  dist/index.js onboard --mode local --no-install-daemon
docker compose run --rm --no-deps --entrypoint node openclaw-gateway \
  dist/index.js config set --batch-json '[{"path":"gateway.mode","value":"local"},{"path":"gateway.bind","value":"lan"},{"path":"gateway.controlUi.allowedOrigins","value":["http://localhost:18789","http://127.0.0.1:18789"]}]'
docker compose up -d openclaw-gateway
```

The Docker context excludes `.git`. Pass the source identity as build arguments
as shown above so the image's About screen reports the checked-out commit and
one build timestamp. `scripts/docker/setup.sh` resolves and passes both values
automatically.

<Note>
Run `docker compose` from the repo root. If you enabled `OPENCLAW_EXTRA_MOUNTS` or `OPENCLAW_HOME_VOLUME`, the setup script writes `docker-compose.extra.yml`; include it after any `docker-compose.override.yml` you maintain yourself, e.g. `-f docker-compose.yml -f docker-compose.override.yml -f docker-compose.extra.yml`.
</Note>

### Upgrading container images

When you rebuild the OpenAgent image from a newer checkout but keep the same mounted state/config, the
new Gateway runs startup-safe upgrade migrations and plugin convergence before
readiness. Routine image upgrades should not require a separate
`openclaw doctor --fix` pass.

If startup cannot complete those repairs safely, the Gateway exits instead of
reporting healthy. With a restart policy, Docker, Podman, or Kubernetes may show
the Gateway container restarting. Keep the mounted state volume, then run the
same image once with `openclaw doctor --fix` as the container command, using the
same state/config mounts the Gateway uses:

```bash
docker run --rm -v <openclaw-state>:/home/node/.openclaw <image> openclaw doctor --fix
podman run --rm -v <openclaw-state>:/home/node/.openclaw <image> openclaw doctor --fix
```

After doctor finishes, restart the Gateway container with its default command.
In Kubernetes, run the same command in a one-off Job or debug pod mounted to the
same PVC, then restart the Deployment or StatefulSet.

After the container is running again, run the read-only deployment preflight
against the same mounted state:

```bash
docker compose run --rm openclaw-cli doctor --json
```

### Source-built images with selected plugins

`OPENCLAW_EXTENSIONS` selects plugin manifest ids from the source checkout;
existing source-directory names are also accepted when they differ. The Docker
build resolves the selection to source directories once, installs production
dependencies, links each selected plugin's own runtime dependencies under its
packaged root in `/app/dist/extensions/<id>`, and includes the selected plugin
runtime in the image. Unknown, invalid, or ambiguous ids fail the image build.
Selected plugins must compile successfully; unselected plugin source and
runtime output are pruned.

For example, this command builds a multi-architecture image that includes only
the Discord plugin and no Chromium:

```bash
SOURCE_SHA="$(git rev-parse HEAD)"
BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg "GIT_COMMIT=${SOURCE_SHA}" \
  --build-arg "OPENCLAW_BUILD_TIMESTAMP=${BUILD_TIMESTAMP}" \
  --build-arg OPENCLAW_EXTENSIONS=discord \
  --build-arg OPENCLAW_INSTALL_BROWSER= \
  --tag "registry.example.com/you/openclaw-discord:${SOURCE_SHA}" \
  --push \
  .
```

Use `--platform linux/arm64 --load` or `--platform linux/amd64 --load` for a
single native local build. Multi-platform output requires a registry or another
Buildx output.

To test bundled plugin source against a packaged image, mount one plugin source directory over its packaged source path, e.g. `OPENCLAW_EXTRA_MOUNTS=/path/to/fork/extensions/telegram:/app/extensions/telegram:ro`. That overrides the matching compiled `/app/dist/extensions/telegram` bundle for the same plugin id. Restart the Gateway after adding or changing a mount; runtime loading and setup use the mounted source.

### Health checks

Container probe endpoints (no auth required):

```bash
curl -fsS http://127.0.0.1:18789/healthz   # liveness
curl -fsS http://127.0.0.1:18789/startupz  # startup and traffic admission
curl -fsS http://127.0.0.1:18789/readyz    # deep, channel-aware readiness
```

The image's built-in `HEALTHCHECK` pings `/healthz`; repeated failures mark the container `unhealthy` so orchestrators can restart or replace it.
Use `/startupz` for an orchestrator startup or readiness probe so a failed channel account does not remove the otherwise healthy Gateway and Control UI from service. Use `/readyz` for monitoring that intentionally treats hard channel failures as not ready. See [Health checks](/gateway/health#http-probes) for response details.

Authenticated deep health snapshot:

```bash
docker compose exec openclaw-gateway sh -lc 'node dist/index.js gateway health --token "$OPENCLAW_GATEWAY_TOKEN"'
```

## Detailed topics

<CardGroup cols={2}>
  <Card title="Environment variables" href="/install/docker/environment-variables" icon="gear">
    The full variable table, apt/pip build extras, and build-memory tuning.
  </Card>
  <Card title="Networking and storage" href="/install/docker/networking-and-storage" icon="server">
    LAN vs loopback, host.docker.internal, Claude CLI, and mounted state.
  </Card>
  <Card title="Compose operations" href="/install/docker/compose-operations" icon="terminal">
    Compose command table, sandbox/CI/DNS/EACCES accordions, and image refreshes.
  </Card>
  <Card title="Sandbox and troubleshooting" href="/install/docker/sandbox-and-troubleshooting" icon="shield">
    Enabling the agent sandbox plus the Docker troubleshooting accordions.
  </Card>
</CardGroup>

- <a id="environment-variables" />[Environment variables](/install/docker/environment-variables#environment-variables)
- <a id="lan-vs-loopback" />[LAN vs loopback](/install/docker/networking-and-storage#lan-vs-loopback)
- <a id="host-local-providers" />[Host local providers](/install/docker/networking-and-storage#host-local-providers)
- <a id="claude-cli-backend-in-docker" />[Claude CLI backend in Docker](/install/docker/networking-and-storage#claude-cli-backend-in-docker)
- <a id="storage-and-persistence" />[Storage and persistence](/install/docker/networking-and-storage#storage-and-persistence)
- <a id="clawdock-migration" />[ClawDock migration](/install/docker/compose-operations#clawdock-migration)
  - <a id="enable-agent-sandbox-for-docker-gateway" />[Enable agent sandbox for Docker gateway](/install/docker/compose-operations#enable-agent-sandbox-for-docker-gateway)
  - <a id="automation-ci-non-interactive" />[Automation / CI (non-interactive)](/install/docker/compose-operations#automation-ci-non-interactive)
  - <a id="shared-network-security-note" />[Shared-network security note](/install/docker/compose-operations#shared-network-security-note)
  - <a id="docker-desktop-dns-failures-in-openclaw-cli" />[Docker Desktop DNS failures in openclaw-cli](/install/docker/compose-operations#docker-desktop-dns-failures-in-openclaw-cli)
  - <a id="permissions-and-eacces" />[Permissions and EACCES](/install/docker/compose-operations#permissions-and-eacces)
  - <a id="faster-rebuilds" />[Faster rebuilds](/install/docker/compose-operations#faster-rebuilds)
  - <a id="power-user-container-options" />[Power-user container options](/install/docker/compose-operations#power-user-container-options)
  - <a id="openai-codex-oauth-headless-docker" />[OpenAI Codex OAuth (headless Docker)](/install/docker/compose-operations#openai-codex-oauth-headless-docker)
  - <a id="base-image-metadata" />[Base image metadata](/install/docker/compose-operations#base-image-metadata)
- <a id="image-contents-and-security-scanning" />[Image contents and security scanning](/install/docker/compose-operations#image-contents-and-security-scanning)
- <a id="weekly-image-refreshes" />[Weekly image refreshes](/install/docker/compose-operations#weekly-image-refreshes)
- <a id="running-on-a-vps%3F" /><a id="running-on-a-vps" />[Running on a VPS?](/install/docker/compose-operations#running-on-a-vps%3F)
- <a id="agent-sandbox" />[Agent sandbox](/install/docker/sandbox-and-troubleshooting#agent-sandbox)
  - <a id="quick-enable" />[Quick enable](/install/docker/sandbox-and-troubleshooting#quick-enable)
- <a id="troubleshooting" />[Troubleshooting](/install/docker/sandbox-and-troubleshooting#troubleshooting)
  - <a id="image-missing-or-sandbox-container-not-starting" />[Image missing or sandbox container not starting](/install/docker/sandbox-and-troubleshooting#image-missing-or-sandbox-container-not-starting)
  - <a id="permission-errors-in-sandbox" />[Permission errors in sandbox](/install/docker/sandbox-and-troubleshooting#permission-errors-in-sandbox)
  - <a id="custom-tools-not-found-in-sandbox" />[Custom tools not found in sandbox](/install/docker/sandbox-and-troubleshooting#custom-tools-not-found-in-sandbox)
  - <a id="oom-killed-during-image-build-exit-137" />[OOM-killed during image build (exit 137)](/install/docker/sandbox-and-troubleshooting#oom-killed-during-image-build-exit-137)
  - <a id="unauthorized-or-pairing-required-in-control-ui" />[Unauthorized or pairing required in Control UI](/install/docker/sandbox-and-troubleshooting#unauthorized-or-pairing-required-in-control-ui)
  - <a id="gateway-target-shows-ws-172-x-x-x-or-pairing-errors-from-docker-cli" />[Gateway target shows ws://172.x.x.x or pairing errors from Docker CLI](/install/docker/sandbox-and-troubleshooting#gateway-target-shows-ws-172-x-x-x-or-pairing-errors-from-docker-cli)

## Related

- [Install Overview](/install) — all installation methods
- [Podman](/install/podman) — Podman alternative to Docker
- [Updating](/install/updating) — keeping OpenAgent up to date
- [Configuration](/gateway/configuration) — Gateway configuration after install

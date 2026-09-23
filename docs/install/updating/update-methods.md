---
summary: "The source-server reference update script for gateways run from a git checkout"
read_when:
  - You run a gateway directly from a git checkout on a server
title: "Other update methods"
sidebarTitle: "Update methods"
---

The source-server reference script. Part of the [Updating](/install/updating) guide.

## Source-checkout servers (reference script)

Teams running a gateway directly from a git checkout on a server can update it
with `scripts/update-gateway.sh` from inside that checkout. It is the reference
for a source-server update: it fails closed on all tracked local changes,
including build outputs, fast-forwards `main` (or rebases a local server branch
onto `origin/main`), installs dependencies with a frozen lockfile, builds clean,
and restarts the gateway only after the build succeeds.

Like `openclaw update`, the script builds runtime JavaScript, plugin assets, and
the Control UI without generating TypeScript declarations by default. Set
`OPENCLAW_RUN_NODE_SKIP_DTS_BUILD=0` when invoking the script if this checkout
also needs fresh declarations for plugin development.

This reference script requires **Corepack** and creates temporary shims without
global activation before fetching. After fetching, it freezes the target commit
and checks that its exact pnpm pin can run through those shims in a private probe
workspace. The probe contains only package-manager metadata, not the target's
dependencies, hooks, or configuration. Missing or invalid metadata, provisioning
failure, or a version mismatch stops before checkout update or restart; repair
the target pin or install a compatible Corepack, then retry.

The same fetched commit is used for fast-forward or rebase. This is a fetched-target
toolchain preflight, not a complete preflight of a rebased local branch or its
build, and the script does not roll back later install or build failures. Local
branch overrides remain in effect: install and build resolve the resulting
checkout's pin, which may differ from the probed target pin. Operators must verify
those overrides and maintain a recovery path. The same shim directory leads
nested commands' `PATH`, and child workspace and lockfile roots follow each
operation's directory. Bootstrap, install, or build failure prevents restart.
This server script deliberately requires Corepack.

<Warning>
A running older updater or server script keeps its old bootstrap code even if it
checks out files containing this repair. If that older entry point invokes
ambient pnpm, the operator must select a target-compatible pnpm launcher before
the first update across the pin change. Validate that launcher against both the
intended target and the known-good rollback ref before starting the update.
Updating target files alone does not repair an older running binary.
</Warning>

Generated output roots such as `dist`, `dist-runtime`, and package-local
`dist` directories must be real directories. Builds refuse symbolic-link roots
before reading or mutating their contents so cleanup cannot affect the link
target. Replace an output-root symlink with a real directory before updating or
building a source checkout.

```bash
ssh you@server 'cd /path/to/CSR-AGENT && scripts/update-gateway.sh'
```

Override the restart for custom service units, or skip it entirely:

```bash
OPENCLAW_UPDATE_RESTART_CMD='systemctl --user restart openclaw-gateway.service' scripts/update-gateway.sh
OPENCLAW_UPDATE_RESTART_CMD='' scripts/update-gateway.sh
```

For a plain single-user source install, prefer `openclaw update`
instead — it manages the checkout, build, and gateway restart for you.

## Related

- [Updating](/install/updating)
- [Rollback and recovery](/install/updating/rollback-and-recovery)

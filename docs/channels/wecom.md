---
summary: "Install the external WeCom plugin and find its versioned setup documentation"
read_when:
  - You want to connect OpenAgent to WeCom
  - You need the supported WeCom plugin and its setup documentation
title: "WeCom"
---

OpenAgent exposes WeCom through the external
`@wecom/wecom-openclaw-plugin` package maintained by the Tencent WeCom team.
The plugin is listed in OpenAgent's official channel catalog but is not bundled
with the core install.

## Install

```bash
openclaw channels add --channel wecom
openclaw channels status --channel wecom
```

The OpenAgent catalog installs an exact version of
`@wecom/wecom-openclaw-plugin`. Start the Gateway if it is offline; see
[Apply changes and inspect](/plugins/manage-plugins#apply-changes-and-inspect).

## Configure

WeCom credentials, connection modes, callback routes, and access-control
behavior belong to the external plugin and can change independently of
OpenAgent. Follow the
[package documentation](https://www.npmjs.com/package/@wecom/wecom-openclaw-plugin)
for the installed release before configuring the channel.

When upgrading the plugin independently, keep using the documentation for the
installed version.

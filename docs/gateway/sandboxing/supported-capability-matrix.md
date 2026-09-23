---
summary: "What each sandbox backend supports for shell, files, workspace, network, browser, and plugin tools"
title: "Supported capability matrix"
read_when: "You are comparing Docker and SSH before choosing a backend."
---

A per-backend comparison of sandbox capabilities, and the Gateway-side execution that stays outside the sandbox boundary.

## Supported capability matrix

Sandbox backends isolate tool execution. They do not move the Gateway, native
plugins, or control-plane RPC into the sandbox.

| Capability                 | Docker                                                                  | SSH                                                  |
| -------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Shell and child processes  | Supported inside the container                                          | Supported on the remote host                         |
| File tools                 | Supported through the container filesystem bridge                       | Supported through the SSH filesystem bridge          |
| Workspace access           | `none`, `ro`, and `rw`                                                  | `none`, `ro`, and `rw`                               |
| Network restriction        | `docker.network`; defaults to `"none"`                                  | Controlled by the remote host                        |
| Sandboxed browser          | Supported in a separate browser container                               | Not supported                                        |
| Additional host folders    | `docker.binds` with explicit `:ro` or `:rw`                             | Not supported as mounts; seed or copy files instead  |
| Packages and runtimes      | Bake a custom image, or use `setupCommand` with the required privileges | Provision them on the remote host                    |
| Private certificate roots  | Bake or mount them into the image and configure the consuming runtime   | Configure the remote host trust store                |
| Plugin and MCP tool access | Gateway-side execution, additionally gated by sandbox tool policy       | Gateway-side execution, additionally gated by policy |

Native plugins remain in-process with the Gateway and share its trust boundary.
Sandboxed sessions can use plugin-owned and MCP tools only when normal tool
policy and `tools.sandbox.tools` both allow them. See
[MCP and plugin tools inside sandbox tool policy](/gateway/config-tools#mcp-and-plugin-tools-inside-sandbox-tool-policy)
and [Plugin execution model](/plugins/architecture#execution-model).

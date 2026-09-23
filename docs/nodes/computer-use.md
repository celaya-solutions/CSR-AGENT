---
summary: "Capability-based desktop control through the computer tool and computer.act node command"
read_when:
  - Letting the gateway agent see and control a paired desktop
  - Enablement, permissions, or safety for computer use
  - Extending the computer.act node command or its fulfillers
title: "Computer use"
doc-schema-version: 1
---

Computer use lets the gateway agent see and control a capable paired desktop. Eligibility is capability-based: the connected node must advertise both `computer.act` and `screen.snapshot`. The node's descriptor identifies the supported v2 action, target, observation, and delivery families, so the built-in `computer` tool exposes only what that provider can faithfully execute. Coordinate actions bind to a node-issued reference frame; capable providers can also address windows and elements, request background delivery, and return structured effect or refusal evidence. A vision-capable model drives the surface through the built-in `computer` agent tool.

For [cloud sessions](/gateway/cloud-sessions#desktop-and-computer-control), the tool is bound to the session's own desktop instead of searching paired nodes.

The agent emits one uniform command, `computer.act`; it cannot choose how a node fulfills it. OpenAgent ships no bundled `computer.act` fulfiller: the former macOS app and the `cua-computer` plugin were removed. A node or plugin you provide must advertise the command pair described below.

## Requirements

- A paired, connected node advertising both `computer.act` and `screen.snapshot`, with `screen.snapshot` returning `displayFrameId`.
- The pairing update that includes `computer.act` approved on the gateway.
- A vision-capable agent model.
- Tool policy that exposes `computer`. The default `coding` profile does not. Add `computer` to `tools.alsoAllow`; ordinary sandboxed agents also need it in `tools.sandbox.tools.alsoAllow`. A cloud session's bound desktop is included in its default sandbox policy, while explicit allowlists and denies still apply.

## The `computer` agent tool

The built-in `computer` tool takes one action per call. Coordinates are non-negative integer pixels in the most recent screenshot; the node maps them to display points. Coordinate actions must echo the screenshot result's `frameId`, and an explicit `screenIndex` must match that frame. OpenAgent also carries a node-issued display identity from the screenshot into the action, so a display reconnect or geometry change fails closed instead of silently retargeting the same index. These checks reject guessed tokens and tokens from another delivered frame or display. A token is not a freshness guarantee: apps can change pixels on the same display after capture, so take a new screenshot whenever the scene may have changed.

- Reads: `screenshot` captures a desktop screen and returns `frameId`. It does not accept window, browser, element, or observation references.
- Pointer: `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click`, `mouse_move`, `left_click_drag` (with `startCoordinate`), `left_mouse_down`, `left_mouse_up`.
- Scroll: `scroll` with `scrollDirection` (`up|down|left|right`) and `scrollAmount` (wheel ticks).
- Keyboard: `type` (text), `key` (combo such as `cmd+shift+t` or `Return`), `hold_key` (`text` combo held for `duration` seconds).
- Pacing: `wait` (`duration` seconds), followed by a screenshot. This action runs locally and is available whenever the selected provider supports screenshots; it does not require a native wait command.

Providers with the v2 window/element family can additionally expose `list_apps`, `list_windows`, `get_accessibility_tree`, `get_cursor_position`, `get_window_state`, `launch_app`, `kill_app`, `bring_to_front`, `set_value`, `zoom`, `escalate_scope`, and `invoke_menu`. The provider descriptor is authoritative; unavailable actions are omitted rather than emulated through another provider.

Window input coordinates follow the observation's `details.coordinateSpace`: `image-pixels` means pixels in the delivered image, including when OpenAgent resized it; `global-logical-points` means desktop logical points. Accessibility element bounds retain their native screen coordinates; prefer `elementRef` when targeting those elements. Browser coordinate inputs use viewport CSS pixels.

For a window image, use `get_window_state` with `windowRef` and `includeScreenshot: true`, then pass the returned `observationId` with window input. Providers that support it can skip capture with `includeScreenshot: false` and refresh accessibility elements and their references. Use those references for element actions; window pixel input still requires an observation with a delivered image. A desktop `frameId` cannot replace a window observation: the images can use different coordinate spaces. Like `screenshot`, `wait` returns a desktop capture and rejects target and observation references.

Providers with the v2 browser family expose `get_browser_state`, `browser_prepare`, `browser_navigate`, `browser_click`, `browser_type`, `browser_dialog`, `browser_set_input_files`, `browser_download`, and `browser_pointer`. Bind a discovered native browser window with `get_browser_state`, then use the returned opaque `browserRef`, `pageRef`, observation, and element references. These references belong to one Computer Use execution and driver generation; navigation invalidates page-element observations, and a driver restart invalidates the complete browser reference set.

Providers with recording support expose `get_recording_state`, `start_recording`, `stop_recording`, and `replay_trajectory`. Recording and browser file operations use opaque `openclaw:computer-resource` handles. The node creates and validates the underlying files and directories; agent actions never accept native paths, output roots, or helper executable paths. Handles belong to one Computer Use execution and cannot be reused by another execution.

Modifier keys ride the `text` field on click and scroll actions (`shift`, `ctrl`, `alt`, `cmd`). After an input action the tool returns a fresh screenshot so the model can observe the result. When the screen is pixel-identical to the previous frame still in model context, the tool returns metadata only — "screen unchanged since previous frame" — and the previous `frameId` stays valid, so duplicate screenshots never re-enter model context. If more than one computer-capable node is connected, pass `node` explicitly.

Screenshots are kept **model-only**: they are never auto-delivered to the chat channel. Treat all on-screen content as untrusted input; the tool warns the model not to follow on-screen instructions that conflict with the user's request.

## The `computer.act` node command

`computer.act` is the single node command the tool routes input through (`node.invoke` with `command: "computer.act"`). It is:

- **Locally enabled**: the node advertises it only while Computer Control is enabled. The gateway can approve that advertised surface once at pairing.
- **Capability-based**: the tool requires a connected node to advertise both `computer.act` and `screen.snapshot`.

Provider descriptors declare `contractVersion: 2`. Invalid capability descriptors or `computer.act` result envelopes are rejected with `COMPUTER_CONTRACT_MISMATCH`.

Direct `node.invoke` calls to the provider-backed `computer.act` command must include an `executionId` UUID in the action parameters. The built-in `computer` tool supplies it automatically.

Reads reuse `screen.snapshot`; there is no second capture path.

## Authorization

1. Enable computer control in the node or plugin that fulfills `computer.act`, and grant it the platform's input and screen-capture permissions.
2. Approve the pairing update on the gateway (a new command forces re-pairing).
3. Expose the tool to the vision-capable agent. For the default `coding` profile:

   ```json5
   {
     tools: {
       alsoAllow: ["computer"],
       // Sandboxed agents need this second gate too:
       sandbox: { tools: { alsoAllow: ["computer"] } },
     },
   }
   ```

Once the node-local control is enabled and the pairing update is approved, `computer.act` is durably available while the node continues to advertise it. There is no lease, expiry, or arm/disarm command. Disabling Computer Control locally removes the advertised command and the node rechecks the toggle at invocation time.

There is no per-action confirmation.

`gateway.nodes.commands.deny` remains an explicit global revocation and always wins; a denied `computer.act` is withheld from the node's advertised surface together with its `computer` capability, and the Gateway records what it withheld. No fulfiller needs a `gateway.nodes.commands.allow` entry: `computer.act` is a built-in desktop platform default, so node-local enablement plus pairing approval is the whole grant for any fulfiller. An authenticated operator with `operator.write` can invoke an enabled, paired command through `node.invoke`; there is no per-action admin check.

## Safety

- Every layer (tool policy, gateway command policy, pairing, node-local setting, and platform permissions) must agree. Actions execute while those durable controls remain enabled; there is no per-action confirmation.
- Recording, replay, browser upload, and browser download paths are node-owned. The model receives only opaque execution-scoped resource handles; traversal, absolute paths, symlink escapes, and helper selection are rejected before driver dispatch.
- Screenshots are model-only and never auto-sent to chat.
- Treat screen content as untrusted; it can carry prompt injection.

## Troubleshooting

<a id="desktop-stream-troubleshooting" />

### Desktop stream

For a disconnected web Desktop panel, check the [Gateway logs](/gateway/logging) for `desktop observer closed` and `node stream closed`, and the node logs for `node stream closed`. The records separate the first local cleanup `trigger` from the observed WebSocket `closeCode`; observer records also include the requested `cleanupCode`.

A `closeCode` of `1006` alone does not identify a network or proxy failure: intentional owner teardown can produce it too. Compare the trigger and available source/connection identities across the Gateway and node. These records omit peer close-reason text, observer tokens, attach tickets, credentials, and desktop payloads.

## Relationship to other desktop-control paths

This is the agent-driven path. See [Codex Computer Use](/plugins/codex-computer-use) for the Codex-mode alternative.

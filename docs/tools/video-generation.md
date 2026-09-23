---
summary: "Generate videos via video_generate from text, image, or video references with OpenAI or OpenRouter"
read_when:
  - Generating videos via the agent
  - Configuring video-generation providers and models
  - Understanding the video_generate tool parameters
title: "Video generation"
sidebarTitle: "Video generation"
---

OpenAgent agents generate videos from text prompts, reference images, or
existing videos through `video_generate`. OpenAI and OpenRouter are the
bundled providers; the agent picks one automatically based on config and
available API keys.

<Note>
`video_generate` only appears when at least one video-generation provider is
available. If it is missing from your agent tools, set a provider API key or
configure `agents.defaults.mediaModels.video`.
</Note>

`video_generate` has three runtime modes, resolved from the reference inputs
in the call:

- `generate` - no reference media (text-to-video).
- `imageToVideo` - one or more reference images.
- `videoToVideo` - one or more reference videos.

Providers can support any subset of those modes. The tool validates the
active mode before submission and reports supported modes in `action=list`.

## Quick start

<Steps>
  <Step title="Configure auth">
    Set an API key for any supported provider:

    ```bash
    export OPENAI_API_KEY="your-key"
    ```

  </Step>
  <Step title="Pick a default model (optional)">
    ```bash
    openclaw config set agents.defaults.mediaModels.video.primary "openai/sora-2"
    ```
  </Step>
  <Step title="Ask the agent">
    > Generate a 5-second cinematic video of a friendly robot surfing at sunset.

    The agent calls `video_generate` automatically. No tool allowlisting
    is needed.

  </Step>
</Steps>

## How async generation works

Video generation is asynchronous:

1. OpenAgent submits the request to the provider and immediately returns a task id.
2. The provider processes the job in the background (typically 30 seconds to several minutes depending on the provider and resolution; slow queue-backed providers can run up to the configured timeout).
3. When the video is ready, OpenAgent wakes the same session with an internal completion event.
4. The agent reports it through the session's normal visible-reply mode:
   automatic final reply, or `message(action="send")` when the session requires
   the message tool. If the requester session is inactive, or its wake fails and
   generated media is still missing from the completion reply, OpenAgent sends
   an idempotent direct fallback with the media.

While a job is in flight, duplicate `video_generate` calls in the same
session return the current task status instead of starting another
generation. Use `action: "status"` to check without triggering a new
generation, or `openclaw tasks list` / `openclaw tasks show <lookup>` from the
CLI (see [Background tasks](/automation/tasks)).

Outside of session-backed agent runs (for example, direct tool invocations),
the tool falls back to inline generation and returns the final media path
in the same turn.

Generated video files save under OpenAgent-managed media storage when the
provider returns bytes. The default cap is 16MB (the shared video media
limit); `agents.defaults.mediaMaxMb` raises it for larger renders. When a
provider also returns a hosted output URL, OpenAgent delivers that URL instead
of failing the task if local persistence rejects an oversized file.

### Task lifecycle

| State       | Meaning                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| `queued`    | Task created, waiting for the provider to accept it.                                                   |
| `running`   | Provider is processing (typically 30 seconds to several minutes depending on provider and resolution). |
| `succeeded` | Video ready; the agent wakes and posts it to the conversation.                                         |
| `failed`    | Provider error or timeout; the agent wakes with error details.                                         |

Check status from the CLI:

```bash
openclaw tasks list
openclaw tasks show <lookup>
openclaw tasks cancel <lookup>
```

## Supported providers

| Provider   | Default model         | Text | Image ref                                       | Video ref | Auth                 |
| ---------- | --------------------- | :--: | ----------------------------------------------- | --------- | -------------------- |
| OpenAI     | `sora-2`              |  ✓   | 1 image                                         | 1 video   | `OPENAI_API_KEY`     |
| OpenRouter | `google/veo-3.1-fast` |  ✓   | Up to 4 images (first/last frame or references) | -         | `OPENROUTER_API_KEY` |

Some providers accept additional or alternate API key env vars. See
individual [provider pages](#related) for details.

Run `video_generate action=list` to inspect available providers, models, and
runtime modes at runtime.

### Capability matrix

The explicit mode contract used by `video_generate`, contract tests, and
the shared live sweep:

| Provider   | `generate` | `imageToVideo` | `videoToVideo` | Shared live lanes                                                                                                           |
| ---------- | :--------: | :------------: | :------------: | --------------------------------------------------------------------------------------------------------------------------- |
| OpenAI     |     ✓      |       ✓        |       ✓        | `generate`, `imageToVideo`; shared `videoToVideo` skipped because this org/input path needs provider-side video edit access |
| OpenRouter |     ✓      |       ✓        |       -        | `generate`, `imageToVideo`                                                                                                  |

## Tool parameters

### Required

<ParamField path="prompt" type="string" required>
  Text description of the video to generate. Required for `action: "generate"`.
</ParamField>

### Content inputs

<ParamField path="image" type="string">Single reference image (path or URL).</ParamField>
<ParamField path="images" type="string[]">Multiple reference images (up to 9).</ParamField>
<ParamField path="imageRoles" type="string[]">
Optional per-position role hints parallel to the combined image list.
Canonical values: `first_frame`, `last_frame`, `reference_image`.
</ParamField>
<ParamField path="video" type="string">Single reference video (path or URL).</ParamField>
<ParamField path="videos" type="string[]">Multiple reference videos (up to 4).</ParamField>
<ParamField path="videoRoles" type="string[]">
Optional per-position role hints parallel to the combined video list.
Canonical value: `reference_video`.
</ParamField>
<ParamField path="audioRef" type="string">
Single reference audio (path or URL). Used for background music or voice
reference when the provider supports audio inputs.
</ParamField>
<ParamField path="audioRefs" type="string[]">Multiple reference audios (up to 3).</ParamField>
<ParamField path="audioRoles" type="string[]">
Optional per-position role hints parallel to the combined audio list.
Canonical value: `reference_audio`.
</ParamField>

<Note>
Role hints are forwarded to the provider as-is. Canonical values come from
the `VideoGenerationAssetRole` union but providers may accept additional
role strings. `*Roles` arrays must not have more entries than the
corresponding reference list; off-by-one mistakes fail with a clear error.
Use an empty string to leave a slot unset.
</Note>

### Style controls

<ParamField path="aspectRatio" type="string">
  Aspect-ratio hint such as `1:1`, `16:9`, `9:16`, `adaptive`, or a provider-specific value. OpenAgent normalizes or ignores unsupported values per provider.
</ParamField>
<ParamField path="resolution" type="string">Resolution hint such as `360P`, `480P`, `540P`, `720P`, `768P`, `1080P`, `4K`, or a provider-specific value. OpenAgent normalizes or ignores unsupported values per provider.</ParamField>
<ParamField path="durationSeconds" type="number">
  Target duration in seconds (rounded to nearest provider-supported value).
</ParamField>
<ParamField path="size" type="string">Size hint when the provider supports it.</ParamField>
<ParamField path="audio" type="boolean">
  Enable generated audio in the output when supported. Distinct from `audioRef*` (inputs).
</ParamField>
<ParamField path="watermark" type="boolean">Toggle provider watermarking when supported.</ParamField>

`adaptive` is a provider-specific sentinel: it is forwarded as-is to
providers that declare `adaptive` in their capabilities, which use it to
auto-detect the ratio from the input image dimensions. Providers that do not declare it surface the value via
`details.ignoredOverrides` in the tool result so the drop is visible.

### Advanced

<ParamField path="action" type='"generate" | "status" | "list"' default="generate">
  `"status"` returns the current session task; `"list"` inspects providers.
</ParamField>
<ParamField path="model" type="string">Provider/model override (e.g. `openai/sora-2`).</ParamField>
<ParamField path="filename" type="string">Output filename hint.</ParamField>
<ParamField path="timeoutMs" type="number">Optional provider operation timeout in milliseconds. When omitted, OpenAgent uses `agents.defaults.mediaModels.video.timeoutMs` if configured, otherwise the plugin-authored provider default when one exists.</ParamField>
<ParamField path="providerOptions" type="object">
  Provider-specific options as a JSON object (e.g. `{"seed": 42, "draft": true}`).
  Providers that declare a typed schema validate the keys and types; unknown
  keys or mismatches skip the candidate during fallback. Providers without a
  declared schema receive the options as-is. Run `video_generate action=list`
  to see what each provider accepts.
</ParamField>

<Note>
Not all providers support all parameters. OpenAgent normalizes duration to
the closest provider-supported value, and remaps translated geometry hints
such as size-to-aspect-ratio when a fallback provider exposes a different
control surface. Truly unsupported overrides are ignored on a best-effort
basis and reported as warnings in the tool result. Hard capability limits
(such as too many reference inputs) fail before submission. Tool results
report applied settings; `details.normalization` captures any
requested-to-applied translation.
</Note>

Reference inputs select the runtime mode:

- No reference media -> `generate`
- Any image reference -> `imageToVideo`
- Any video reference -> `videoToVideo`
- Reference audio inputs **do not** change the resolved mode; they apply on
  top of whatever mode the image/video references select, and only work
  with providers that declare `maxInputAudios`.

Mixed image and video references are not a stable shared capability surface.
Prefer one reference type per request.

#### Fallback and typed options

Some capability checks apply at the fallback layer rather than the tool
boundary, so a request that exceeds the primary provider's limits can still
run on a capable fallback:

- Active candidate declaring no `maxInputAudios` (or `0`) is skipped when
  the request contains audio references; next candidate is tried. The same
  guard applies to image and video reference counts against
  `maxInputImages`/`maxInputVideos`.
- Active candidate's `maxDurationSeconds` below the requested `durationSeconds`
  with no declared `supportedDurationSeconds` list -> skipped.
- Request contains `providerOptions` and the active candidate explicitly
  declares a typed `providerOptions` schema -> skipped if supplied keys are
  not in the schema or value types do not match. Providers without a
  declared schema receive options as-is (backward-compatible
  pass-through). A provider can opt out of all provider options by
  declaring an empty schema (`capabilities.providerOptions: {}`), which
  causes the same skip as a type mismatch.

The first skip reason in a request logs at `warn` so operators see when
their primary provider was passed over; subsequent skips log at `debug` to
keep long fallback chains quiet. If every candidate is skipped, the
aggregated error includes the skip reason for each.

## Actions

| Action     | What it does                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `generate` | Default. Create a video from the given prompt and optional reference inputs.                             |
| `status`   | Check the state of the in-flight video task for the current session without starting another generation. |
| `list`     | Show available providers, models, and their capabilities.                                                |

## Model selection

For `video_generate`, OpenAgent resolves the model in this order:

1. **`model` tool parameter** - when set, only this model is tried.
2. **`agents.defaults.mediaModels.video.primary`** from config.
3. **`agents.defaults.mediaModels.video.fallbacks`** in order.
4. **Auto-detection** - only when neither a primary nor fallback model is
   configured, using configured provider defaults. The current default provider
   comes first, then remaining providers in alphabetical order.

If a provider fails, the next candidate is tried automatically. If all
candidates fail, the error includes details from each attempt.

Explicit video model configuration limits fallback to the configured list;
OpenAgent does not append auto-detected providers.

```json5
{
  agents: {
    defaults: {
      mediaModels: {
        video: {
          primary: "openai/sora-2",
          fallbacks: ["openrouter/google/veo-3.1-fast"],
          timeoutMs: 180000, // optional per-tool provider request timeout override
        },
      },
    },
  },
}
```

## Provider notes

<AccordionGroup>
  <Accordion title="OpenAI">
    Only `size` override is forwarded. Other style overrides
    (`aspectRatio`, `resolution`, `audio`, `watermark`) are ignored with
    a warning.
  </Accordion>
  <Accordion title="OpenRouter">
    Uses OpenRouter's asynchronous `/videos` API. OpenAgent submits the
    job, polls `polling_url`, and downloads either `unsigned_urls` or the
    documented job content endpoint. The bundled `google/veo-3.1-fast` default
    advertises 4/6/8 second durations, `720P`/`1080P` resolutions, and
    `16:9`/`9:16` aspect ratios.
  </Accordion>
</AccordionGroup>

## Provider capability modes

The shared video-generation contract supports mode-specific capabilities
instead of only flat aggregate limits. New provider implementations
should prefer explicit mode blocks:

```typescript
capabilities: {
  generate: {
    maxVideos: 1,
    maxDurationSeconds: 10,
    supportsResolution: true,
  },
  imageToVideo: {
    enabled: true,
    maxVideos: 1,
    maxInputImages: 1,
    maxInputImagesByModel: { "provider/reference-to-video": 9 },
    maxDurationSeconds: 5,
  },
  videoToVideo: {
    enabled: true,
    maxVideos: 1,
    maxInputVideos: 1,
    maxDurationSeconds: 5,
  },
}
```

Flat aggregate fields such as `maxInputImages` and `maxInputVideos` are
**not** enough to advertise transform-mode support. Providers should
declare `generate`, `imageToVideo`, and `videoToVideo` explicitly so live
tests, contract tests, and the shared `video_generate` tool can validate
mode support deterministically.

When one model in a provider has wider reference-input support than the
rest, use `maxInputImagesByModel`, `maxInputVideosByModel`, or
`maxInputAudiosByModel` instead of raising the mode-wide limit.

## Live tests

Opt-in live coverage for the shared bundled providers:

```bash
OPENCLAW_LIVE_TEST=1 pnpm test:live -- extensions/video-generation-providers.live.test.ts
```

This live file uses already-exported provider env vars ahead of stored auth
profiles by default, and runs a release-safe smoke by default:

- `generate` for every provider in the sweep.
- One-second test prompt.
- Per-provider operation cap from
  `OPENCLAW_LIVE_VIDEO_GENERATION_TIMEOUT_MS` (`180000` by default).

Set `OPENCLAW_LIVE_VIDEO_GENERATION_FULL_MODES=1` to also run declared
transform modes the shared sweep can exercise safely with local media:

- `imageToVideo` when `capabilities.imageToVideo.enabled`.
- `videoToVideo` when `capabilities.videoToVideo.enabled` and the
  provider/model accepts buffer-backed local video input in the shared
  sweep.

## Configuration

Set the default video-generation model in your OpenAgent config:

```json5
{
  agents: {
    defaults: {
      mediaModels: {
        video: {
          primary: "openai/sora-2",
          fallbacks: ["openrouter/google/veo-3.1-fast"],
        },
      },
    },
  },
}
```

Or via the CLI:

```bash
openclaw config set agents.defaults.mediaModels.video.primary "openai/sora-2"
```

## Related

- [Background tasks](/automation/tasks) - task tracking for async video generation
- [Configuration reference](/gateway/config-agents#agent-defaults)
- [Models](/concepts/models)
- [OpenAI](/providers/openai)
- [OpenRouter](/providers/openrouter)
- [Tools overview](/tools)
- [Media overview](/tools/media-overview) - how the media tools fit together

---
summary: "Generate and edit images via image_generate with OpenAI or OpenRouter"
read_when:
  - Generating or editing images via the agent
  - Configuring image-generation providers and models
  - Understanding the image_generate tool parameters
title: "Image generation"
sidebarTitle: "Image generation"
---

The `image_generate` tool creates and edits images through your configured
providers. In chat sessions it runs asynchronously: OpenAgent records a
background task, returns the task id immediately, and wakes the agent when
the provider finishes. The task record stays silent, while the completion
agent follows the session's current visible-reply contract with a short
user-facing caption and every structured generated attachment. If generation
fails, the agent returns a concise visible failure instead. If the requester
session is inactive or its active wake fails, OpenAgent sends an idempotent
direct fallback with the generated images so the result is not lost.

<Note>
The tool only appears when at least one image-generation provider is
available. If you do not see `image_generate` in your agent's tools,
configure `agents.defaults.mediaModels.image`, set up a provider API key,
or sign in with OpenAI ChatGPT/Codex OAuth.
</Note>

## Quick start

<Steps>
  <Step title="Configure auth">
    Set an API key for at least one provider (`OPENAI_API_KEY` or
    `OPENROUTER_API_KEY`) or sign in with OpenAI ChatGPT/Codex OAuth.
  </Step>
  <Step title="Pick a default model (optional)">
    ```json5
    {
      agents: {
        defaults: {
          mediaModels: {
            image: {
              primary: "openai/gpt-image-2",
              timeoutMs: 180000,
            },
          },
        },
      },
    }
    ```

    ChatGPT/Codex OAuth uses the same `openai/gpt-image-2` model ref. When an
    `openai` OAuth profile is configured, OpenAgent routes image requests
    through that OAuth profile instead of first trying `OPENAI_API_KEY`.
    Explicit `models.providers.openai` config (API key, custom/Azure base URL)
    opts back into the direct OpenAI Images API route.

  </Step>
  <Step title="Ask the agent">
    _"Generate an image of a friendly robot mascot."_

    The agent calls `image_generate` automatically. No tool allow-listing
    needed - it is enabled by default when a provider is available. The tool
    returns a background task id, then the completion agent replies with every
    generated attachment when it is ready.

  </Step>
</Steps>

<Warning>
For OpenAI-compatible LAN endpoints such as LocalAI, keep the custom
`models.providers.openai.baseUrl` and explicitly opt in with
`browser.ssrfPolicy.dangerouslyAllowPrivateNetwork: true`. Private and
internal image endpoints remain blocked by default.
</Warning>

## Common routes

| Goal                                             | Model ref                                                       | Auth                                           |
| ------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------- |
| OpenAI image generation with API billing         | `openai/gpt-image-2`                                            | `OPENAI_API_KEY`                               |
| OpenAI GPT Image 2.5                             | `openai/gpt-image-2.5-flare` or `openai/gpt-image-2.5-sunburst` | Explicit OpenAI API-key route                  |
| OpenAI image generation with ChatGPT/Codex OAuth | `openai/gpt-image-2`                                            | OpenAI ChatGPT/Codex OAuth                     |
| OpenAI transparent-background PNG/WebP           | `openai/gpt-image-1.5`                                          | `OPENAI_API_KEY` or OpenAI ChatGPT/Codex OAuth |
| OpenRouter image generation                      | `openrouter/google/gemini-3.1-flash-image-preview`              | `OPENROUTER_API_KEY`                           |

The same tool handles text-to-image and reference-image editing. Use `image`
for one reference or `images` for multiple.
Provider-supported output hints such as `quality`, `outputFormat`, and
`background` are forwarded when available and reported as ignored when a
provider does not declare support. OpenAI declares transparent-background
support. Other providers may still preserve PNG alpha if their
backend emits it.

OpenAI supports `low` and `auto` moderation for both text-to-image generation
and reference-image edits through the direct Images API or the Codex Responses
backend. For CLI requests, pass `--openai-moderation low|auto` to either
`openclaw infer image generate` or `openclaw infer image edit`.

## Supported providers

| Provider   | Default model                           | Edit support               | Auth                                           |
| ---------- | --------------------------------------- | -------------------------- | ---------------------------------------------- |
| OpenAI     | `gpt-image-2`                           | Yes (up to 5 images)       | `OPENAI_API_KEY` or OpenAI ChatGPT/Codex OAuth |
| OpenRouter | `google/gemini-3.1-flash-image-preview` | Yes (up to 5 input images) | `OPENROUTER_API_KEY`                           |

Use `action: "list"` to inspect available providers and models at runtime:

```text
/tool image_generate action=list
```

Use `action: "status"` to inspect the active image-generation task for the
current session:

```text
/tool image_generate action=status
```

## Provider capabilities

| Capability       | OpenAI         | OpenRouter           |
| ---------------- | -------------- | -------------------- |
| Edit / reference | Up to 5 images | Up to 5 input images |
| Size control     | Up to 4K       | Model-specific       |

## Tool parameters

<ParamField path="prompt" type="string" required>
  Image generation prompt. Required for `action: "generate"`.
</ParamField>
<ParamField path="action" type='"generate" | "status" | "list"' default="generate">
  Use `"status"` to inspect the active session task or `"list"` to inspect
  available providers and models at runtime.
</ParamField>
<ParamField path="model" type="string">
  Provider/model override (e.g. `openai/gpt-image-2`). Use
  `openai/gpt-image-1.5` for transparent OpenAI backgrounds.
</ParamField>
<ParamField path="image" type="string">
  Single reference image path or URL for edit mode.
</ParamField>
<ParamField path="images" type="string[]">
  Multiple reference images for edit mode or style-reference models (up to 16
  through the shared tool. Provider-specific limits still apply).
</ParamField>
<ParamField path="size" type="string">
  Size hint: `1024x1024`, `1536x1024`, `1024x1536`, `2048x2048`, `3840x2160`.
</ParamField>
<ParamField path="aspectRatio" type="string">
  Aspect ratio: `1:1`, `2:1`, `20:9`, `19.5:9`, `2:3`, `3:2`, `2.35:1`, `3:4`,
  `4:3`, `4:5`, `5:4`, `9:16`, `9:19.5`, `9:20`, `16:9`, `21:9`, `1:2`, `4:1`,
  `1:4`, `8:1`, `1:8`. Providers validate their model-specific subset.
</ParamField>
<ParamField path="resolution" type='"1K" | "2K" | "4K"'>Resolution hint.</ParamField>
<ParamField path="quality" type='"low" | "medium" | "high" | "xhigh" | "max" | "auto"'>
  Quality hint when the model supports it. GPT Image 2.5 supports `xhigh`
  and `max`.
</ParamField>
<ParamField path="outputFormat" type='"png" | "jpeg" | "webp"'>
  Output format hint when the provider supports it.
</ParamField>
<ParamField path="background" type='"transparent" | "opaque" | "auto"'>
  Background hint when the provider supports it. Use `transparent` with
  `outputFormat: "png"` or `"webp"` for transparency-capable providers.
</ParamField>
<ParamField path="count" type="number">Number of images to generate (1-4).</ParamField>
<ParamField path="timeoutMs" type="number">
  Optional provider request timeout in milliseconds. When Codex calls
  `image_generate` through dynamic tools, this per-call value still overrides
  the configured default and is capped at 600000 ms.
</ParamField>
<ParamField path="filename" type="string">Output filename hint.</ParamField>
<ParamField path="openai" type="object">
  OpenAI-only hints: `background`, `moderation`, `outputCompression`, and `user`.
</ParamField>
<ParamField path="fal.creativity" type='"raw" | "low" | "medium" | "high"'>
  Creativity control read by a fal provider plugin, which is not bundled.
</ParamField>

<Note>
Not all providers support all parameters. When a fallback provider supports a
nearby geometry option instead of the exact requested one, OpenAgent remaps to
the closest supported size, aspect ratio, or resolution before submission.
Unsupported output hints are dropped for providers that do not declare
support and reported in the tool result. Tool results report the applied
settings. `details.normalization` captures any requested-to-applied
translation.
</Note>

## Configuration

### Model selection

```json5
{
  agents: {
    defaults: {
      mediaModels: {
        image: {
          primary: "openai/gpt-image-2",
          timeoutMs: 180000,
          fallbacks: ["openrouter/google/gemini-3.1-flash-image-preview"],
        },
      },
    },
  },
}
```

### Provider selection order

For `image_generate`, OpenAgent tries providers in this order:

1. **`model` parameter** from the tool call. When set, only this model is tried.
2. **`agents.defaults.mediaModels.image.primary`** from config.
3. **`agents.defaults.mediaModels.image.fallbacks`** in order.
4. **Auto-detection** - only when neither a primary nor fallback model is
   configured, using configured provider defaults:
   - current default provider first.
   - remaining registered image-generation providers in provider-id order.

If a provider fails (auth error, rate limit, etc.), the next configured
candidate is tried automatically. If all fail, the error includes details
from each attempt.

<AccordionGroup>
  <Accordion title="Per-call model overrides are exact">
    A per-call `model` override tries only that provider/model and does
    not continue to configured primary/fallback or auto-detected providers.
  </Accordion>
  <Accordion title="Auto-detection uses configured providers">
    Auto-detection considers provider defaults whose readiness or auth checks pass.
    Explicit image model configuration limits fallback to the configured list.
    OpenAgent does not append auto-detected providers.
  </Accordion>
  <Accordion title="Timeouts">
    Set `agents.defaults.mediaModels.image.timeoutMs` for slow image
    backends. A per-call `timeoutMs` tool parameter overrides the configured
    default, and configured defaults override plugin-authored provider
    defaults. The OpenRouter hosted image provider uses a 180 second default,
    and Azure OpenAI image generation uses 600 seconds. Codex dynamic-tool calls use a 120 second `image_generate`
    bridge default and honor the same timeout budget when configured, bounded
    by OpenAgent's 600000 ms dynamic-tool bridge maximum.
  </Accordion>
  <Accordion title="Inspect at runtime">
    Use `action: "list"` to inspect the currently registered providers,
    their default models, and auth env-var hints.
  </Accordion>
</AccordionGroup>

### Image editing

OpenAI and OpenRouter support editing reference images. Pass a reference
image path or URL:

```text
"Generate a watercolor version of this photo" + image: "/path/to/photo.jpg"
```

OpenAI and OpenRouter support up to 5 reference images via the `images`
parameter.

## Provider deep dives

<AccordionGroup>
  <Accordion title="OpenAI gpt-image-2 (and gpt-image-1.5)">
    OpenAI image generation defaults to `openai/gpt-image-2`. If an
    `openai` OAuth profile is configured, OpenAgent reuses the same
    OAuth profile used by Codex subscription chat models and sends the
    image request through the Codex Responses backend. Legacy Codex base
    URLs such as `https://chatgpt.com/backend-api` are canonicalized to
    `https://chatgpt.com/backend-api/codex` for image requests. OpenAgent
    does **not** silently fall back to `OPENAI_API_KEY` for that request -
    to force direct OpenAI Images API routing, configure
    `models.providers.openai` explicitly with an API key, custom base URL,
    or Azure endpoint.

    The `openai/gpt-image-1.5`, `openai/gpt-image-1`, and
    `openai/gpt-image-1-mini` models can still be selected explicitly. Use
    `gpt-image-1.5` for transparent-background PNG/WebP output. The current
    `gpt-image-2` API rejects `background: "transparent"`.

    `gpt-image-2` supports both text-to-image generation and
    reference-image editing through the same `image_generate` tool.
    OpenAgent forwards `prompt`, `count`, `size`, `quality`, `outputFormat`,
    and reference images to OpenAI. OpenAI does **not** receive
    `aspectRatio` or `resolution` directly. When possible OpenAgent maps
    those into a supported `size`, otherwise the tool reports them as
    ignored overrides.

    For direct OpenAI Images API requests, `gpt-image-2` and its
    `gpt-image-2-2026-04-21` snapshot preserve valid explicit
    `WIDTHxHEIGHT` sizes instead of snapping them to presets. Both
    dimensions must be multiples of 16, neither may exceed 3840 pixels,
    the aspect ratio cannot exceed 3:1, and the image must contain
    between 655,360 and 8,294,400 pixels. For example, `1024x640` is
    valid. When only `aspectRatio` is specified, OpenAgent still selects
    the closest supported size.

    OpenAI-specific options live under the `openai` object:

    ```json
    {
      "quality": "low",
      "outputFormat": "jpeg",
      "openai": {
        "background": "opaque",
        "moderation": "low",
        "outputCompression": 60,
        "user": "end-user-42"
      }
    }
    ```

    `openai.background` accepts `transparent`, `opaque`, or `auto`.
    Transparent outputs require `outputFormat` `png` or `webp` and a
    transparency-capable OpenAI image model. OpenAgent routes default
    `gpt-image-2` transparent-background requests to `gpt-image-1.5`.
    `openai.outputCompression` applies to JPEG/WebP outputs and is ignored
    for PNG outputs.

    The top-level `background` hint is provider-neutral and maps
    to the same OpenAI `background` request field when the OpenAI provider
    is selected. Providers that do not declare background support return
    it in `ignoredOverrides` instead of receiving the unsupported parameter.

    To route OpenAI image generation through an Azure OpenAI deployment
    instead of `api.openai.com`, see
    [Azure OpenAI endpoints](/providers/openai/azure#azure-openai-endpoints).

  </Accordion>
  <Accordion title="OpenRouter image models">
    OpenRouter image generation uses the same `OPENROUTER_API_KEY` and
    routes canonical requests through OpenRouter's dedicated `/api/v1/images`
    endpoint. Configured custom OpenRouter base URLs retain the existing
    chat-completions image route for proxy compatibility. Select OpenRouter
    image models with the `openrouter/` prefix:

    ```json5
    {
      agents: {
        defaults: {
          mediaModels: {
            image: {
              primary: "openrouter/google/gemini-3.1-flash-image-preview",
            },
          },
        },
      },
    }
    ```

    OpenAgent forwards `prompt`, `count`, reference images, and
    Gemini-compatible `aspectRatio` / `resolution` hints to OpenRouter.
    Current built-in OpenRouter image model shortcuts include
    `google/gemini-3.1-flash-image`,
    `google/gemini-3-pro-image`, and `openai/gpt-5.4-image-2`. Use
    `action: "list"` to see what your configured plugin exposes.

  </Accordion>
</AccordionGroup>

## Examples

<Tabs>
  <Tab title="Generate (4K landscape)">
```text
/tool image_generate action=generate model=openai/gpt-image-2 prompt="A clean editorial poster for OpenAgent image generation" size=3840x2160 count=1
```
  </Tab>
  <Tab title="Generate (transparent PNG)">
```text
/tool image_generate action=generate model=openai/gpt-image-1.5 prompt="A simple red circle sticker on a transparent background" outputFormat=png background=transparent
```

Equivalent CLI:

```bash
openclaw infer image generate \
  --model openai/gpt-image-1.5 \
  --output-format png \
  --background transparent \
  --prompt "A simple red circle sticker on a transparent background" \
  --json
```

  </Tab>
  <Tab title="Generate (OpenAI low quality)">
```text
/tool image_generate action=generate model=openai/gpt-image-2 prompt="Low-cost draft poster for a quiet productivity app" quality=low openai='{"moderation":"low"}'
```

Equivalent CLI:

```bash
openclaw infer image generate \
  --model openai/gpt-image-2 \
  --quality low \
  --openai-moderation low \
  --prompt "Low-cost draft poster for a quiet productivity app" \
  --json
```

  </Tab>
  <Tab title="Generate (two square)">
```text
/tool image_generate action=generate model=openai/gpt-image-2 prompt="Two visual directions for a calm productivity app icon" size=1024x1024 count=2
```
  </Tab>
  <Tab title="Edit (one reference)">
```text
/tool image_generate action=generate model=openai/gpt-image-2 prompt="Keep the subject, replace the background with a bright studio setup" image=/path/to/reference.png size=1024x1536
```
  </Tab>
  <Tab title="Edit (multiple references)">
```text
/tool image_generate action=generate model=openai/gpt-image-2 prompt="Combine the character identity from the first image with the color palette from the second" images='["/path/to/character.png","/path/to/palette.jpg"]' size=1536x1024
```
  </Tab>
</Tabs>

The same `--output-format`, `--background`, and `--quality` flags are available
on `openclaw infer image edit`. `--openai-background` remains as an
OpenAI-specific alias. Use `--openai-moderation low|auto` with both OpenAI image
generation and reference-image edits. The direct OpenAI Images API and the
ChatGPT/Codex OAuth Responses backend both support the moderation hint.
OpenAI models support explicit background control. Other bundled providers report `background: "transparent"` as ignored.

## Related

- [Tools overview](/tools) - all available agent tools
- [OpenAI](/providers/openai) - OpenAI Images provider setup
- [OpenRouter](/providers/openrouter) - OpenRouter image provider setup
- [Configuration reference](/gateway/config-agents#agent-defaults) - `agents.defaults.mediaModels.image` config
- [Models](/concepts/models) - model configuration and failover
- [Media overview](/tools/media-overview) - how the media tools fit together

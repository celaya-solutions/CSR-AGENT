---
summary: "Every tts.* and tts.providers.<id>.* configuration field"
title: "Text-to-speech field reference"
read_when:
  - You need the type, default, or env var for one TTS field
  - You are checking a legacy field alias
  - You are validating a provider block
---

## Field reference

Provider `apiKey` fields, including `personas.<id>.providers.<provider>.apiKey`,
can be raw strings or SecretRefs in global, per-agent, and Discord voice TTS config.
During cold Gateway startup, an unavailable TTS SecretRef marks the built-in TTS capability
configured-unavailable instead of stopping the Gateway. `tts.speak` then returns
`UNAVAILABLE` with reason `SECRET_SURFACE_UNAVAILABLE`, and no provider request is
sent. Status and doctor list the degraded TTS owner and its config paths. The
explicit refs remain in the runtime snapshot, so environment or profile
credentials cannot silently select a different account. Reloads and config-write
preflight apply the owner-aware degradation policy: an unchanged eligible TTS
owner may keep its last-known-good credentials as stale, while a new or changed
failure becomes cold without blocking healthy owners. Structurally invalid refs
and resolved values still fail startup or reject the update.

<AccordionGroup>
  <Accordion title="Top-level tts.*">
    <ParamField path="auto" type='"off" | "always" | "inbound" | "tagged"'>
      Auto-TTS mode. `inbound` only sends audio after an inbound voice message; `tagged` only sends audio when the reply includes `[[tts:...]]` directives or a `[[tts:text]]` block.
    </ParamField>
    <ParamField path="enabled" type="boolean" deprecated>
      Legacy toggle. `openagent doctor --fix` migrates this to `auto`.
    </ParamField>
    <ParamField path="mode" type='"final" | "all"' default="final">
      `"all"` includes tool/block replies in addition to final replies.
    </ParamField>
    <ParamField path="provider" type="string">
      Speech provider id. When unset, OpenAgent uses the first configured provider in registry auto-select order.
    </ParamField>
    <ParamField path="persona" type="string">
      Active persona id from `personas`. Normalized to lowercase.
    </ParamField>
    <ParamField path="personas.<id>" type="object">
      Stable spoken identity. Fields: `label`, `description`, `provider`, `fallbackPolicy`, `providers.<provider>`. See [Personas](/tools/tts/personas#personas).
    </ParamField>
    <ParamField path="summaryModel" type="string">
      Cheap model for auto-summary; defaults to `agents.defaults.model.primary`. Accepts `provider/model` or a configured model alias.
    </ParamField>
    <ParamField path="modelOverrides" type="object">
      Allow the model to emit TTS directives. `enabled` defaults to `true`; `allowProvider` defaults to `false`.
    </ParamField>
    <ParamField path="providers.<id>" type="object">
      Provider-owned settings keyed by speech provider id. Legacy direct blocks such as `tts.openai` are rewritten by `openagent doctor --fix`; commit only `tts.providers.<id>`.
    </ParamField>
    <ParamField path="maxTextLength" type="number" default="4096">
      Hard cap for TTS input characters. `/tts audio`, `tts.convert`, and `tts.speak` fail if exceeded.
    </ParamField>
    <ParamField path="timeoutMs" type="number" default="30000">
      Request timeout in milliseconds. A per-call `timeoutMs` (agent tool, gateway) wins when set; otherwise an explicitly configured `tts.timeoutMs` wins over any plugin-authored provider default.
    </ParamField>
  </Accordion>

  <Accordion title="OpenAI">
    <ParamField path="apiKey" type="string">Falls back to `OPENAI_API_KEY`.</ParamField>
    <ParamField path="model" type="string">OpenAI TTS model id. Default `gpt-4o-mini-tts`.</ParamField>
    <ParamField path="speakerVoice" type="string">Voice name (e.g. `alloy`, `cedar`). Default `coral`. Legacy alias: `voice`.</ParamField>
    <ParamField path="instructions" type="string">Explicit OpenAI `instructions` field. When set, persona prompt fields are **not** auto-mapped.</ParamField>
    <ParamField path="responseFormat" type='"mp3" | "opus" | "wav"'>Explicit response format. When omitted, OpenAgent selects Opus for voice-note targets and MP3 otherwise. Use `wav` for compatible local endpoints that do not encode compressed audio.</ParamField>
    <ParamField path="extraBody / extra_body" type="Record<string, unknown>">Extra JSON fields merged into `/audio/speech` request bodies after generated OpenAI TTS fields. Use this for OpenAI-compatible endpoints such as Kokoro that require provider-specific keys like `lang`; unsafe prototype keys are ignored.</ParamField>
    <ParamField path="baseUrl" type="string">
      Override the OpenAI TTS endpoint. Resolution order: config → `OPENAI_TTS_BASE_URL` → `https://api.openai.com/v1`. Non-default values are treated as OpenAI-compatible TTS endpoints, so custom model and voice names are accepted, and `speed` loses its `0.25..4.0` range check.
    </ParamField>
  </Accordion>

  <Accordion title="OpenRouter">
    <ParamField path="apiKey" type="string">Env: `OPENROUTER_API_KEY`. Can reuse `models.providers.openrouter.apiKey`.</ParamField>
    <ParamField path="baseUrl" type="string">Default `https://openrouter.ai/api/v1`. Legacy `https://openrouter.ai/v1` is normalized.</ParamField>
    <ParamField path="model" type="string">Default `hexgrad/kokoro-82m`. Alias: `modelId`.</ParamField>
    <ParamField path="speakerVoice" type="string">Default `af_alloy`. Legacy aliases: `voice`, `voiceId`.</ParamField>
    <ParamField path="responseFormat" type='"mp3" | "pcm"'>Default `mp3`.</ParamField>
    <ParamField path="speed" type="number">Provider-native speed override.</ParamField>
  </Accordion>

</AccordionGroup>

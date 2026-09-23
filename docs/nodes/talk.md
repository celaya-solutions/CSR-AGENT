---
summary: "Talk mode: continuous speech conversations across local STT/TTS and realtime voice"
read_when:
  - Implementing a Talk mode client
  - Changing voice/TTS/interrupt behavior
title: "Talk mode"
---

Talk mode covers these runtime shapes:

- **Browser Talk**: `talk.client.create` for client-owned `webrtc`/`provider-websocket` sessions, or `talk.session.create` for Gateway-owned `gateway-relay` sessions. `managed-room` is reserved for Gateway handoff and walkie-talkie rooms.
- **Transcription-only clients**: `talk.session.create({ mode: "transcription", transport: "gateway-relay", brain: "none" })`, then `talk.session.appendAudio` and `talk.session.close` for captions/dictation without an assistant voice response. One-shot uploaded voice notes still use the [media understanding](/nodes/media-understanding) audio path.

A Talk session is a continuous loop. It listens for speech. It sends the transcript to the model through the active session. It waits for the response. It then speaks the response through the configured Talk provider (`talk.speak`).

For replies dominated by fenced code, `talk.speak` uses a short spoken message directing the listener to the screen. Inline code and ordinary prose remain part of the spoken reply.

## Talk documentation pages

Talk mode is documented on this page and two child pages, one per reader job.
This page keeps the voice directives and the `talk` configuration reference.
Open the child page that matches your task.

| Page                                                                   | Read it when                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Talk realtime sessions and delegation](/nodes/talk/realtime-sessions) | You are wiring realtime Talk: voice selection, delegation, steering, and transcripts. |
| [Talk session ownership](/nodes/talk/session-ownership)                | You need agent and session resolution, control authority, or close semantics.         |

## Where each section moved

Every section heading from the previous single-page version keeps its anchor
here, so an existing link such as `/nodes/talk#session-ownership` still
resolves. Each entry points at the page that now holds the content.

- <a id="choose-a-talk-voice-from-chat" />[Choose a Talk voice from chat](/nodes/talk/realtime-sessions#choose-a-talk-voice-from-chat)
- <a id="session-ownership" />[Session ownership](/nodes/talk/session-ownership#session-ownership)
- <a id="when-realtime-cannot-start" />When realtime cannot start

## Voice directives in replies

The assistant can prefix a reply with a single JSON line to control voice:

```json
{ "voice": "<voice-id>", "once": true }
```

Rules:

- First non-empty line only. The JSON line is stripped before TTS playback.
- Unknown keys are ignored.
- `once: true` applies to the current reply only. Without it, the voice becomes the new Talk mode default.

Supported keys: `voice` / `voice_id` / `voiceId`, `model` / `model_id` / `modelId`, `speed`, `rate` (WPM), `stability`, `similarity`, `style`, `speakerBoost`, `seed`, `normalize`, `lang`, `output_format`, `latency_tier`, `once`.

## Config (`~/.openclaw/openclaw.json`)

Angle-bracket values such as `<elevenlabs-api-key>` are placeholders. Replace them
with your own values.

```json5
{
  talk: {
    provider: "elevenlabs",
    providers: {
      elevenlabs: {
        voiceId: "<elevenlabs-voice-id>",
        modelId: "eleven_v3",
        outputFormat: "mp3_44100_128",
        apiKey: "<elevenlabs-api-key>",
      },
      mlx: {
        modelId: "mlx-community/Soprano-80M-bf16",
        // Fish S2 Pro can also use a local reference voice:
        // referenceAudioPath: "/Users/example/Voices/reference.wav",
        // referenceText: "Exact transcript of the reference clip.",
      },
      system: {},
    },
    speechLocale: "ru-RU",
    silenceTimeoutMs: 1500,
    interruptOnSpeech: true,
    realtime: {
      provider: "openai",
      providers: {
        openai: {
          apiKey: "<openai-api-key>",
          model: "gpt-realtime-2.1",
          speakerVoice: "cedar",
        },
      },
      instructions: "Speak warmly and keep answers brief.",
      mode: "realtime",
      transport: "webrtc",
      brain: "agent-consult",
    },
  },
}
```

OpenAI browser WebRTC and Gateway-relay Talk support native GPT-Live. Select
`gpt-live-1` for the public API or `gpt-live-1-codex` for the Codex route in
**Settings → Talk**. The public API requires a Platform key; the Codex route
prefers an OpenAgent ChatGPT OAuth profile and falls back to Platform API-key
authentication. Browser Talk uses client WebRTC with Gateway-owned control.
Gateway relay uses direct Platform-key WebSockets for `gpt-live-1` and
Gateway-owned WebRTC for `gpt-live-1-codex`. Discord uses these same Gateway
bridges when configured with the corresponding Live model.

Account-issued, unlisted routes can be set in `talk.realtime.model`, but are
not published through catalogs or diagnostics. They never use OAuth and require
a Platform key. GPT-Live browser Talk also requires the bundled `openai` plugin
registered in full mode. A restrictive `plugins.allow` list fails session
creation with "OpenAI GPT-Live
browser session broker is unavailable".
Runtime bounds: 8 concurrent sessions per Gateway and a 30-minute session TTL.
Browser sessions also use 60-second single-use offer tokens.

The Codex route uses `arbor`, `breeze`, `cove`, `ember`, `juniper`, `maple`,
`sol`, `spruce`, and `vale`, with `cove` as the default. The public API defaults
to `marin` and has its own [voice list](/providers/openai/voice-and-speech).
Choose the same model and supported voice in Talk and Discord to use the same
voice; `cove` with the public `gpt-live-1` model falls back to `marin`.
Unlisted routes use their account-issued voice contract; the current unlisted
Platform profile accepts `marin` and `cedar`. A rejected session does not
identify the cause by itself. Check the selected account, model, and voice.

GPT-Live handles interruption natively and produces continuous audio without
requiring completed-response events. Discord preserves each speaker's identity
through delegated OpenAgent work. Its voice-model connections remain separate
per speaker; shared room context belongs to the OpenAgent agent conversation.
See [GPT-Live in Discord](/channels/discord/voice-channels#gpt-live-in-discord)
for configuration and the limits on host-enforced meeting participation.

| Consumer               | GPT-Live status                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Browser Talk           | Codex route: OAuth-first; public API and unlisted routes: Platform-key client WebRTC           |
| Gateway-relay Talk     | Codex route: OAuth-first WebRTC; public API and unlisted routes: direct Platform-key transport |
| Discord realtime voice | Same Gateway bridges as Talk: Codex OAuth-first WebRTC or public Platform-key WebSocket        |

These rows describe implemented transport paths, not account entitlement or a
successful live call on every device. For model capability limits, see
[Discord voice policies](/channels/discord/voice-channels#voice-channels).

The Gateway-owned WebRTC route keeps OAuth and Platform credentials away from
relay clients. Backend WebSocket paths keep the Platform key on the Gateway.
OpenAgent converts telephony G.711 u-law audio to and from GPT-Live's 24 kHz PCM
contract.

For GA `gpt-realtime-2.1`, `gpt-realtime-2.1-mini`, and `gpt-realtime-2`
browser sessions, Platform credentials remain preferred in this order: the
configured realtime API key, an `openai` API-key profile, then
`OPENAI_API_KEY`. With none configured, browser Talk falls back to an OpenAgent
ChatGPT OAuth profile and exchanges SDP through the Gateway's single-use offer
broker, so the OAuth token never reaches the browser. A configured Platform
credential that cannot be resolved fails closed instead of silently falling
through to OAuth.

GA Gateway relay remains Platform-key-only. GA browser Talk keeps the existing client-owned data channel
and `talk.client.toolCall` loop. Only the credential owner and SDP exchange path
change under OAuth. The Codex GPT-Live route remains OAuth-first with
Platform fallback for browser and Gateway-owned WebRTC, including Discord.
Public GPT-Live, direct backend sockets, and unlisted GPT-Live routes remain
Platform-key-only.

| Key                                      | Default                                     | Notes                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentId`                                | configured default agent                    | Owns Talk sessions created without an explicit agent-scoped session key.                                                                                                                                                                                       |
| `provider`                               | -                                           | Active Talk TTS provider. Use `elevenlabs`, `mlx`, or `system` for macOS-local playback paths.                                                                                                                                                                 |
| `providers.<id>.voiceId`                 | -                                           | ElevenLabs falls back to `ELEVENLABS_VOICE_ID` / `SAG_VOICE_ID`, or the first available voice with an API key.                                                                                                                                                 |
| `speechLocale`                           | device default                              | BCP 47 locale for Android, iOS, and macOS native speech recognition, plus the iOS system-voice fallback. Apple Speech may use network services; Android also forwards the language component to realtime input transcription.                                  |
| `providers.elevenlabs.modelId`           | `eleven_multilingual_v2`                    |                                                                                                                                                                                                                                                                |
| `providers.mlx.modelId`                  | `mlx-community/Soprano-80M-bf16`            |                                                                                                                                                                                                                                                                |
| `providers.mlx.referenceAudioPath`       | -                                           | Optional client-local reference recording for MLX models that support voice cloning. The path is resolved on the native macOS app host.                                                                                                                        |
| `providers.mlx.referenceText`            | -                                           | Exact transcript of `referenceAudioPath`; Fish S2 Pro uses both values for local voice cloning.                                                                                                                                                                |
| `providers.elevenlabs.apiKey`            | -                                           | Falls back to `ELEVENLABS_API_KEY` (or gateway shell profile if available).                                                                                                                                                                                    |
| `silenceTimeoutMs`                       | `700` ms macOS/Android, `900` ms iOS        | Pause window before Talk sends the transcript.                                                                                                                                                                                                                 |
| `interruptOnSpeech`                      | `true`                                      |                                                                                                                                                                                                                                                                |
| `providers.<id>.outputFormat`            | `pcm_44100` macOS/iOS, `pcm_24000` Android  | Set `mp3_*` to force MP3 streaming.                                                                                                                                                                                                                            |
| `consultThinkingLevel`                   | unset                                       | Thinking level override for the agent run behind realtime `openclaw_agent_consult` calls.                                                                                                                                                                      |
| `consultFastMode`                        | unset                                       | Fast-mode override for realtime `openclaw_agent_consult` calls.                                                                                                                                                                                                |
| `realtime.provider`                      | -                                           | `openai` for WebRTC, `google` for provider WebSocket, or a bridge-only provider through Gateway relay.                                                                                                                                                         |
| `realtime.providers.<id>`                | -                                           | Provider-owned realtime config. Browsers receive only ephemeral/constrained session credentials, never a standard API key.                                                                                                                                     |
| `realtime.providers.openai.speakerVoice` | `alloy` for GA; route-specific for GPT-Live | Built-in OpenAI realtime voice id (the older `voice` key still works but is deprecated). GA voices: `alloy`, `ash`, `ballad`, `cedar`, `coral`, `echo`, `marin`, `sage`, `shimmer`, `verse`. GPT-Live uses the route-specific voice families documented above. |
| `realtime.model`                         | provider default                            | Realtime voice model. Overrides `realtime.providers.<id>.model` when both are set — the same precedence `talk.client.create` applies at session time.                                                                                                          |
| `realtime.transport`                     | -                                           | `webrtc`: OpenAI WebRTC on iOS, in the browser, and on Watch with Gateway control. `provider-websocket`: browser-owned, stays on Gateway relay on iOS. `gateway-relay`: keeps provider audio on the Gateway; Android uses realtime only with this transport.   |
| `realtime.brain`                         | -                                           | `agent-consult` routes realtime tool calls through Gateway policy; `direct-tools` is legacy direct-tool compatibility; `none` is for transcription/external orchestration.                                                                                     |
| `realtime.consultRouting`                | -                                           | `provider-direct` preserves the provider's direct reply when it skips `openclaw_agent_consult`; `force-agent-consult` routes finalized user transcripts through OpenAgent instead.                                                                             |
| `realtime.instructions`                  | -                                           | Appends provider-facing system instructions to OpenAgent's built-in realtime prompt.                                                                                                                                                                           |

`talk.catalog` exposes canonical provider ids and registry aliases. It exposes each provider's valid modes/transports/brain strategies/realtime audio formats/capability flags. It exposes the runtime-selected readiness result. First-party Talk clients should read that catalog instead of maintaining provider aliases locally. Treat an older Gateway that omits group readiness as unverified rather than definitively unconfigured. Streaming transcription providers are discovered through `talk.catalog.transcription`. The current Gateway relay uses the Voice Call streaming provider config until a dedicated Talk transcription config surface ships.

## Notes

- The gateway resolves Talk playback through `talk.speak` using the active Talk provider.
- Voice directive value ranges (ElevenLabs): the `stability`, `similarity`, and `style` keys accept `0..1`. The `speed` key accepts `0.5..2`. The `latency_tier` key accepts `0..4`.

## Related

- [Voice wake](/nodes/voicewake)
- [Audio and voice notes](/nodes/audio)
- [Media understanding](/nodes/media-understanding)
- [Media overview](/tools/media-overview) — how the media tools fit together

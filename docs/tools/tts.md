---
summary: "Index of the OpenAgent text-to-speech documentation, one page per reader job"
title: "Text-to-speech"
sidebarTitle: "Text to speech (TTS)"
read_when:
  - Enabling text-to-speech for replies
  - Configuring a TTS provider, fallback chain, or persona
  - Using /tts commands or directives
---

OpenAgent converts outbound replies into native voice messages on Telegram.
Every other channel receives an audio attachment. Talk receives PCM streams.

TTS is the speech-output half of [Talk](/nodes/talk)'s `stt-tts` mode (`talk.speak` calls this
same synthesis path). Provider-native `realtime` Talk sessions synthesize
speech inside the realtime provider instead. `transcription` sessions never
synthesize an assistant voice reply.

This page is an index. Text-to-speech is documented on seven pages, one per
reader job. Open the page that matches your task.

| Page                                                         | Read it when                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [Text-to-speech quickstart](/tools/tts/quickstart)           | You are turning TTS on, choosing a provider, and testing it from chat.                   |
| [Text-to-speech configuration](/tools/tts/configuration)     | You need the `tts` config block, a provider snippet, or override precedence.             |
| [Text-to-speech personas](/tools/tts/personas)               | You want one stable spoken identity, its provider bindings, and its fallback policy.     |
| [Commands and directives](/tools/tts/commands)               | You need `[[tts:...]]` directives, the `/tts` commands, or where local preferences live. |
| [Output and Auto-TTS behavior](/tools/tts/output)            | You need the audio format per channel, transcoding rules, or when Auto-TTS summarizes.   |
| [Text-to-speech field reference](/tools/tts/field-reference) | You need the type, default, env var, or legacy alias for one TTS field.                  |
| [Agent tool and Gateway RPC](/tools/tts/api)                 | You are calling TTS from an agent tool call or a Gateway RPC method.                     |

## Where each section moved

Every section heading from the previous single-page version keeps its anchor
here, so an existing link such as `/tools/tts#per-agent-voice-overrides` still
resolves. Each entry points at the page that now holds the content.

- <a id="quick-start" />[Quick start](/tools/tts/quickstart#quick-start)
- <a id="supported-providers" />[Supported providers](/tools/tts/quickstart#supported-providers)
- <a id="configuration" />[Configuration](/tools/tts/configuration#configuration)
- <a id="per-agent-voice-overrides" />[Per-agent voice overrides](/tools/tts/configuration#per-agent-voice-overrides)
- <a id="personas" />[Personas](/tools/tts/personas#personas)
- <a id="minimal-persona" />[Minimal persona](/tools/tts/personas#minimal-persona)
- <a id="full-persona-(provider-specific-shaping)" />[Full persona (provider-specific shaping)](</tools/tts/personas#full-persona-(provider-specific-shaping)>)
- <a id="persona-resolution" />[Persona resolution](/tools/tts/personas#persona-resolution)
- <a id="custom-persona-shaping" />[Custom persona shaping](/tools/tts/personas#custom-persona-shaping)
- <a id="fallback-policy" />[Fallback policy](/tools/tts/personas#fallback-policy)
- <a id="model-driven-directives" />[Model-driven directives](/tools/tts/commands#model-driven-directives)
- <a id="slash-commands" />[Slash commands](/tools/tts/commands#slash-commands)
- <a id="per-user-preferences" />[Per-user preferences](/tools/tts/commands#per-user-preferences)
- <a id="output-formats" />[Output formats](/tools/tts/output#output-formats)
- <a id="auto-tts-behavior" />[Auto-TTS behavior](/tools/tts/output#auto-tts-behavior)
- <a id="field-reference" />[Field reference](/tools/tts/field-reference#field-reference)
- <a id="agent-tool" />[Agent tool](/tools/tts/api#agent-tool)
- <a id="gateway-rpc" />[Gateway RPC](/tools/tts/api#gateway-rpc)
- <a id="full-persona-provider-specific-shaping" />[Full persona (provider-specific shaping)](/tools/tts/personas#full-persona-provider-specific-shaping)

## Service links

- [OpenAI provider](/providers/openai)
- [OpenAI Audio API reference](https://platform.openai.com/docs/api-reference/audio)
- [OpenAI text-to-speech guide](https://platform.openai.com/docs/guides/text-to-speech)

## Related

- [Media overview](/tools/media-overview)
- [Media playback](/nodes/media-playback)
- [Music generation](/tools/music-generation)
- [Video generation](/tools/video-generation)
- [Slash commands](/tools/slash-commands)

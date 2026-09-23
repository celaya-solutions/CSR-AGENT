---
summary: "Per-channel audio formats, transcoding, and what Auto-TTS sends"
title: "Text-to-speech output and Auto-TTS behavior"
read_when:
  - You need the audio format a channel receives
  - You are debugging voice-note delivery or transcoding
  - You want to know when Auto-TTS summarizes or truncates a reply
---

## Output formats

TTS voice delivery is channel-capability driven. Channel plugins advertise
whether voice-style TTS should ask providers for a native `voice-note` target or
keep normal `audio-file` synthesis, and whether the channel transcodes
non-native output before sending.

One-off speech requests from the agent tool and `/tts` commands use the same
channel delivery rules as automatic replies.

Telegram also advertises captioned final TTS. With `tts.mode: "final"` and
Auto-TTS set to `always` (or eligible `inbound` mode), streamed text is held
until synthesis finishes and sent as the voice-note caption. Text beyond
Telegram's caption limit follows the voice note as a normal text message. If
synthesis or a proven pre-send delivery step fails, OpenAgent sends the visible
text instead. `tagged` mode keeps its normal streaming behavior, and text
inside a `[[tts:text]]` block remains audio-only.

After synthesis, OpenAgent persists batch TTS output in the media store under
`tool-speech-synthesis`. The reply uses that stable media path instead of a
provider temporary file, and normal media maintenance prunes expired output.
See [Media playback](/nodes/media-playback)
for inline-player formats and limits.

| Target         | Format                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Telegram       | Voice-note replies prefer **Opus** (`opus` from OpenAI). 48 kHz / 64 kbps balances clarity and size. |
| Other channels | **MP3** (`mp3` from OpenAI). 44.1 kHz / 128 kbps is the default balance for speech.                  |
| Talk           | Provider-native **PCM**.                                                                             |

OpenAI chooses output formats per channel as listed above. An
explicit OpenAI `responseFormat` overrides that selection; a format that is not
voice-note compatible may be delivered as an audio file or transcoded by a
channel that supports conversion.

## Auto-TTS behavior

When `tts.auto` is enabled, OpenAgent:

- Keeps terminal slash and plugin command replies text-only, including with
  `auto: "always"`. Explicit speech requests such as `/tts audio` and `/tts latest`
  still send audio. Commands that continue into an assistant run keep the normal
  auto-TTS behavior for the assistant's answer.
- Skips TTS if the reply already contains structured media.
- Skips very short replies (under 10 chars).
- Skips replies dominated by fenced code; inline code and surrounding prose remain eligible for speech.
- Summarizes long replies when summaries are enabled, using
  `summaryModel` (or `agents.defaults.model.primary`).
- Attaches the generated audio to the reply.
- In `mode: "final"`, sends TTS after streamed text completes. Channels without
  captioned-final support receive an audio-only supplement; Telegram puts text
  within its caption limit on the voice note and sends overflow as follow-up
  text. Generated media goes through the same channel media normalization as
  normal reply attachments.

If the reply exceeds `maxLength`, OpenAgent never skips audio outright:

- **Summary on** (default) and a summary model is available: summarizes the
  text to roughly `maxLength` chars, then synthesizes the summary.
- **Summary off**, summarization fails, or no API key is available for the
  summary model: truncates the text to `maxLength` chars and synthesizes the
  truncated text.

```text
Reply -> TTS enabled?
  no  -> send text
  yes -> has media / short?
          yes -> send text
          no  -> length > limit?
                   no  -> TTS -> attach audio
                   yes -> summary enabled and available?
                            no  -> truncate -> TTS -> attach audio
                            yes -> summarize -> TTS -> attach audio
```

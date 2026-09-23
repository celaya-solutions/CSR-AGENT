---
summary: "Image and media handling rules for send, gateway, and agent replies"
read_when:
  - Modifying media pipeline or attachments
title: "Image and media support"
---

This page covers media handling rules for send, gateway, and agent replies.

For inline audio and video in the Control UI, including
portable formats, byte limits, and lazy transcoding, see
[Media playback](/nodes/media-playback).

## Goals

- Send media with an optional caption via `openclaw message send --media`.
- Allow auto-replies to include media alongside text.
- Keep per-type limits sane and predictable.

## CLI Surface

`openclaw message send --target <dest> --media <path-or-url> [--message <caption>]`

- `--media <path-or-url>` — attach media (image/audio/video/document); accepts local paths or URLs. Optional; caption can be empty for media-only sends.
- `--force-document` — send images, GIFs, and videos as documents on Telegram to avoid channel compression.
- `--reply-to <id>`, `--thread-id <id>`, `--pin`, `--silent` — delivery/threading options shared with text-only sends.
- `--dry-run` — print the resolved payload and skip sending.
- `--json` — print the result as JSON: `{ action, channel, dryRun, handledBy, messageId?, payload }` (`payload` carries the channel-specific send result, including any media reference).

## Message tool attachment metadata

For `buffer` attachments, `contentType` takes precedence over `mimeType`; a data URL's
MIME type is used only when neither is supplied. For `reply`, `sendAttachment`,
`upload-file`, and `setGroupIcon`, top-level MIME metadata also takes precedence over
the selected `attachments[]` entry. Hydration carries that choice as `contentType`
and uses it to infer a missing filename. Explicit filenames are preserved. This
metadata precedence does not change MIME detection when media bytes are loaded or staged.

## Outbound media behavior

- Input: local file path **or** HTTP(S) URL.
- Flow: load into a buffer, detect media kind, then let the channel build the outbound payload per kind within its limits.
- MIME detection prefers sniffed magic bytes, then the file extension, then response headers; a generic sniffed container (`application/octet-stream`, `zip`) never overrides a more specific extension mapping (for example XLSX vs ZIP).
- Caption comes from `--message` or `reply.text`; empty caption is allowed.

## Auto-Reply Pipeline

- `getReplyFromConfig` returns a reply payload (or array of payloads) with `text?`, `mediaUrl?`, and `mediaUrls?` among other fields.
- When media is present, the channel sender resolves local paths or URLs using the same pipeline as `openclaw message send`.
- Multiple media entries are sent sequentially if provided.

Generated attachments stay separate from later tool-error warnings. Image references
in errors or reasoning do not select or discard generated attachments.

When a channel converts Markdown image links into attachments, image syntax inside
code blocks or inline code, and escaped image syntax, stays in the text. Inline
image destinations retain their URL punctuation.

## Inbound Media To Commands

- When inbound web messages include media, OpenAgent downloads it to a temp file and exposes templating variables:
  - `{{AttachmentUrl}}` — original URL or provider reference for the current attachment.
  - `{{AttachmentPath}}` — local temp path written before running the command.
  - `{{AttachmentContentType}}` — MIME content type.
  - `{{AttachmentDir}}` — directory containing the local path.
  - `{{AttachmentIndex}}` — zero-based source fact index.
- When a per-session Docker sandbox is enabled, inbound media is copied into the sandbox workspace and the attachment path/reference is rewritten to a sandbox-relative path like `media/inbound/<filename>`.
- `{{MediaPath}}`, `{{MediaUrl}}`, `{{MediaType}}`, and `{{MediaDir}}` remain deprecated compatibility aliases for the `{{Attachment*}}` names that replaced them in 2026.8.1. Their approved `removeAfter` date is 2026-10-01, gated on a clean published-plugin artifact sweep; migrate before then. See [Media legacy projection](/plugins/sdk-migration/compatibility-policy#media-legacy-projection).
- Media understanding (configured via `tools.media.*` or shared `tools.media.models`) runs before templating and can insert `[Image]`, `[Audio]`, and `[Video]` blocks into `Body`.
  - Audio sets `{{Transcript}}` and uses the transcript for command parsing so slash commands still work.
  - Video and image descriptions preserve any caption text for command parsing.
  - Native-vision models can skip the `[Image]` summary block. See [Rules and behavior](/nodes/media-understanding#rules-and-behavior) for the rule.
- By default only the first matching image/audio/video attachment is processed; use `tools.media.<capability>.attachments` to select multiple attachments.

## Limits and errors

**Outbound send caps**

- Audio/video: 16MB shared default when no explicit byte cap is passed; a channel's `mediaMaxMb` overrides it.
- Documents: 100MB shared default; a channel's `mediaMaxMb` overrides it.
- Oversize or unreadable media produces a clear error in logs, and the reply is skipped. Size errors use readable byte units rather than rounding fractional caps to a whole MB.

**Media understanding caps (transcription/description)**

- Image default: 10MB (override with `tools.media.image.maxBytes`, or per
  `tools.media.models[]` entry with `maxBytes`).
- Audio default: 20MB (override with `tools.media.audio.maxBytes`, or per entry).
- Video default: 50MB (override with `tools.media.video.maxBytes`, or per entry).
- Oversize media skips understanding, but the reply still goes through with the original body.

## Notes for Tests

- Cover send and reply flows for image/audio/document cases.
- Validate size bounds after image optimization and the voice-note flag for audio.
- Ensure multi-media replies fan out as sequential sends.

## Related

- [Media understanding](/nodes/media-understanding)
- [Media playback](/nodes/media-playback)
- [Audio and voice notes](/nodes/audio)

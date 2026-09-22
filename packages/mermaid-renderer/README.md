# Shared Mermaid renderer

The Control UI uses one pinned Mermaid engine, sandbox, and SVG sanitizer.
`renderMermaidSvg` renders in an opaque iframe and returns passive, sanitized
SVG. The host never inserts diagram-controlled HTML.

The renderer limits source to 20,000 UTF-16 code units, edges to 200, and SVG
output to 1,000,000 code units and 5,000 elements. The render watchdog is 15
seconds, and raster decoding has a separate five-second watchdog. Failed renders
leave source available in the caller's UI.

Browser contract tests live in `ui/src/components/markdown-mermaid*.test.ts`.
They cover the sandbox, SVG sanitization, streaming presentation, image
decoding, and oversized-preview recovery.

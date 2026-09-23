/**
 * Help examples shown by the Browser CLI root command.
 */
/** Core Browser CLI examples for lifecycle and inspection commands. */
export const browserCoreExamples = [
  "openagent browser status",
  "openagent browser start",
  "openagent browser start --headless",
  "openagent browser stop",
  "openagent browser tabs",
  "openagent browser open https://example.com",
  "openagent browser focus abcd1234",
  "openagent browser close abcd1234",
  "openagent browser screenshot",
  "openagent browser screenshot --full-page",
  "openagent browser screenshot --ref 12",
  "openagent browser snapshot",
  "openagent browser snapshot --format aria --limit 200",
  "openagent browser snapshot --efficient",
  "openagent browser snapshot --labels",
];

/** Browser CLI examples for interaction/action commands. */
export const browserActionExamples = [
  "openagent browser navigate https://example.com",
  "openagent browser resize 1280 720",
  "openagent browser click 12 --double",
  "openagent browser click-coords 120 340",
  'openagent browser type 23 "hello" --submit',
  "openagent browser press Enter",
  "openagent browser hover 44",
  "openagent browser drag 10 11",
  "openagent browser select 9 OptionA OptionB",
  "openagent browser upload /tmp/openclaw/uploads/file.pdf",
  "openagent browser upload media://inbound/file.pdf",
  'openagent browser fill --fields \'[{"ref":"1","value":"Ada"}]\'',
  "openagent browser dialog --accept",
  'openagent browser wait --text "Done"',
  "openagent browser evaluate --fn '(el) => el.textContent' --ref 7",
  "openagent browser evaluate --fn 'const title = document.title; return title;'",
  "openagent browser console --level error",
  "openagent browser pdf",
  "openagent browser batch --actions-file plan.json",
  'openagent browser batch --actions \'[{"kind":"wait","timeMs":500},{"kind":"click","ref":"12"},{"kind":"type","ref":"23","text":"hello"}]\'',
  "openagent browser batch --actions-file plan.json --continue",
];

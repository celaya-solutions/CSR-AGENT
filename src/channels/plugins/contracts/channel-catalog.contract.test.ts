// Channel catalog contract tests cover bundled and registry-backed channel catalog invariants.
import {
  describeBundledMetadataOnlyChannelCatalogContract,
  describeExternalChannelCatalogContract,
} from "./test-helpers/channel-catalog-contract.js";

const telegramMeta = {
  id: "telegram",
  label: "Telegram",
  selectionLabel: "Telegram (Bot API)",
  docsPath: "/channels/telegram",
  blurb: "simplest way to get started.",
};

describeBundledMetadataOnlyChannelCatalogContract({
  pluginId: "telegram",
  packageName: "@openclaw/telegram",
  npmSpec: "@openclaw/telegram",
  meta: telegramMeta,
  defaultChoice: "npm",
});

describeExternalChannelCatalogContract({
  channelId: "telegram",
  meta: telegramMeta,
  packageName: "@openclaw/telegram",
  externalNpmSpec: "@vendor/telegram-fork",
  externalLabel: "Telegram Fork",
});

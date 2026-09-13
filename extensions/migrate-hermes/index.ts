// Migrate Hermes plugin entrypoint registers its Zero to Agent integration.
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { buildHermesMigrationProvider } from "./provider.js";

export default definePluginEntry({
  id: "migrate-hermes",
  name: "Hermes Migration",
  description: "Imports Hermes state into Zero to Agent.",
  register(api) {
    api.registerMigrationProvider(buildHermesMigrationProvider({ runtime: api.runtime }));
  },
});

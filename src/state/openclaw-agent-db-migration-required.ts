import { StartupMaintenanceRequiredError } from "../infra/startup-maintenance-required.js";

export class OpenClawAgentDatabaseMediaMigrationRequiredError extends StartupMaintenanceRequiredError {
  constructor(
    readonly pathname: string,
    readonly schemaVersion: number,
  ) {
    super(
      "agent-media",
      `OpenAgent agent database ${pathname} uses schema version ${schemaVersion}; run openagent doctor --fix to migrate persisted media before using it.`,
    );
    this.name = "OpenClawAgentDatabaseMediaMigrationRequiredError";
  }
}

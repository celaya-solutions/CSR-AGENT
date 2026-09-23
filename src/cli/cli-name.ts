/** Canonical binary name for command examples, completion, and process labels. */
export const CLI_NAME = "openagent";

/** Every installed binary name: the canonical one plus the `openclaw` alias the package keeps. */
const CLI_COMMAND_NAMES: ReadonlySet<string> = new Set([CLI_NAME, "openclaw"]);

/** True when a bare executable base name launches this CLI under either binary name. */
export function isCliCommandName(name: string | undefined): boolean {
  return name !== undefined && CLI_COMMAND_NAMES.has(name);
}

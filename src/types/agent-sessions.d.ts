// Declares extension points for agent session type augmentation.
export type OpenClawAgentSessionSkillSourceAugmentation = never;

declare module "openclaw/plugin-sdk/agent-sessions" {
  interface Skill {
    // Zero to Agent relies on the source identifier returned by skill loaders.
    source: string;
  }
}

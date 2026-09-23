// Message secret scope tests cover CLI secret scoping for message commands.
import { describe, expect, it } from "vitest";
import { resolveMessageSecretScope } from "./message-secret-scope.js";

describe("resolveMessageSecretScope", () => {
  it("prefers explicit channel/account inputs", () => {
    expect(
      resolveMessageSecretScope({
        channel: "Telegram",
        accountId: "Ops",
      }),
    ).toEqual({
      channel: "telegram",
      accountId: "ops",
    });
  });

  it("infers channel from a prefixed target", () => {
    expect(
      resolveMessageSecretScope({
        target: "telegram:12345",
      }),
    ).toEqual({
      channel: "telegram",
    });
  });

  it("infers a shared channel from target arrays", () => {
    expect(
      resolveMessageSecretScope({
        targets: ["telegram:one", "telegram:two"],
      }),
    ).toEqual({
      channel: "telegram",
    });
  });

  it("does not infer a channel when target arrays mix channels", () => {
    expect(
      resolveMessageSecretScope({
        targets: ["telegram:one", "discord:two"],
      }),
    ).toStrictEqual({});
  });

  it("uses fallback channel/account when direct inputs are missing", () => {
    expect(
      resolveMessageSecretScope({
        fallbackChannel: "Telegram",
        fallbackAccountId: "Chat",
      }),
    ).toEqual({
      channel: "telegram",
      accountId: "chat",
    });
  });
});

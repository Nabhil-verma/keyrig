import { describe, expect, it } from "vitest";
import { keyViewsAfterTurn } from "./chatTurnHelpers";

const view = {
  id: "key_1",
  label: "Work",
  providerId: "openai",
  last4: "1234",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("KS-05 key views after a turn", () => {
  it("reads the key cards from the vault", () => {
    expect(keyViewsAfterTurn({ listKeys: () => [view] })).toEqual([view]);
  });

  it("returns null when a sign-out locked the vault", () => {
    expect(
      keyViewsAfterTurn({
        listKeys: () => {
          throw new Error("vault_locked");
        },
      }),
    ).toBeNull();
  });

  it("returns null when there is no vault", () => {
    expect(keyViewsAfterTurn(null)).toBeNull();
  });
});

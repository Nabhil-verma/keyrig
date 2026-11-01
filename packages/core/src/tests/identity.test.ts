import { describe, expect, it } from "vitest";
import {
  normalizeRecoveryEmail,
  parseGithubDeviceStart,
  parseGithubToken,
  readGoogleIdToken,
} from "../identity";

function jwt(claims: Record<string, unknown>): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

const CLIENT_ID = "1234.apps.googleusercontent.com";

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 600,
    email: "Person@gmail.com",
    email_verified: true,
    name: "Person",
    ...overrides,
  };
}

describe("the recovery email is a Gmail address", () => {
  it("accepts a Gmail address in any letter case", () => {
    expect(normalizeRecoveryEmail("  Person@Gmail.com ")).toBe("person@gmail.com");
    expect(normalizeRecoveryEmail("a.b@gmail.com")).toBe("a.b@gmail.com");
  });

  it("refuses another domain", () => {
    expect(() => normalizeRecoveryEmail("person@yahoo.com")).toThrow(/gmail/);
    expect(() => normalizeRecoveryEmail("person@gmail.co")).toThrow(/gmail/);
  });

  it("refuses text that is not an address", () => {
    expect(() => normalizeRecoveryEmail("person")).toThrow();
    expect(() => normalizeRecoveryEmail("")).toThrow();
  });
});

describe("the Google token names the address", () => {
  it("reads a verified Gmail token", () => {
    expect(readGoogleIdToken(jwt(claims()), { clientId: CLIENT_ID })).toEqual({
      email: "person@gmail.com",
      name: "Person",
    });
  });

  it("refuses another client id", () => {
    expect(() => readGoogleIdToken(jwt(claims()), { clientId: "other.apps.googleusercontent.com" })).toThrow(
      /client id/,
    );
  });

  it("refuses an expired token", () => {
    const expired = claims({ exp: Math.floor(Date.now() / 1000) - 60 });
    expect(() => readGoogleIdToken(jwt(expired), { clientId: CLIENT_ID })).toThrow(/expired/);
  });

  it("refuses an address that Google did not verify", () => {
    expect(() => readGoogleIdToken(jwt(claims({ email_verified: false })), { clientId: CLIENT_ID })).toThrow(
      /not verified/,
    );
  });

  it("refuses a token from an unknown issuer", () => {
    expect(() => readGoogleIdToken(jwt(claims({ iss: "https://example.com" })), { clientId: CLIENT_ID })).toThrow(
      /issuer/,
    );
  });

  it("refuses a token when no client id is set", () => {
    expect(() => readGoogleIdToken(jwt(claims()), { clientId: " " })).toThrow(/client id/);
  });

  it("refuses text that is not a token", () => {
    expect(() => readGoogleIdToken("not-a-token", { clientId: CLIENT_ID })).toThrow();
  });
});

describe("the GitHub device flow answers", () => {
  it("reads a device code", () => {
    expect(
      parseGithubDeviceStart({
        device_code: "abc",
        user_code: "WDJB-MJHT",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 5,
      }),
    ).toEqual({
      deviceCode: "abc",
      userCode: "WDJB-MJHT",
      verificationUri: "https://github.com/login/device",
      expiresIn: 900,
      interval: 5,
    });
  });

  it("refuses an incomplete device code", () => {
    expect(() => parseGithubDeviceStart({ user_code: "WDJB" })).toThrow();
    expect(() => parseGithubDeviceStart({ error: "unauthorized_client" })).toThrow(/unauthorized_client/);
  });

  it("reads a token and a pending answer", () => {
    expect(parseGithubToken({ access_token: "gho_123" })).toEqual({ token: "gho_123", error: null });
    expect(parseGithubToken({ error: "authorization_pending" })).toEqual({
      token: null,
      error: "authorization_pending",
    });
  });
});

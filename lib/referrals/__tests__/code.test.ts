import { describe, it, expect } from "vitest";
import { generateInviteCode, isValidInviteCodeShape, INVITE_CODE_LENGTH } from "../code";

describe("generateInviteCode", () => {
  it("returns a 10-character code from the lowercase-alphanumeric alphabet", () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    expect(code).toMatch(/^[0-9a-z]{10}$/);
  });

  it("produces distinct codes across many calls (sanity entropy check)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 1000; i++) codes.add(generateInviteCode());
    expect(codes.size).toBe(1000);
  });
});

describe("isValidInviteCodeShape", () => {
  it("accepts well-formed codes", () => {
    expect(isValidInviteCodeShape("abc123def4")).toBe(true);
    expect(isValidInviteCodeShape(generateInviteCode())).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(isValidInviteCodeShape("short")).toBe(false);
    expect(isValidInviteCodeShape("waytoolongacode")).toBe(false);
  });

  it("rejects out-of-alphabet chars", () => {
    expect(isValidInviteCodeShape("ABC123DEF4")).toBe(false); // uppercase
    expect(isValidInviteCodeShape("abc-123def")).toBe(false); // dash
    expect(isValidInviteCodeShape("abc_123def")).toBe(false); // underscore
  });
});

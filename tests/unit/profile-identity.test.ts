import { describe, it, expect } from "vitest";
import { parseProfileEdit, validateIdentityField } from "@/lib/server/validation";
import { telegramPublicRef } from "@/lib/server/telegramRef";

describe("validateIdentityField", () => {
  it("accepts valid usernames and rejects bad ones", () => {
    expect(validateIdentityField("username", "good_name1")).toBeNull();
    expect(validateIdentityField("username", "ab")).not.toBeNull(); // too short
    expect(validateIdentityField("username", "has space")).not.toBeNull();
    expect(validateIdentityField("username", "has@symbol")).not.toBeNull();
  });

  it("accepts valid emails and rejects bad ones", () => {
    expect(validateIdentityField("email", "a@b.co")).toBeNull();
    expect(validateIdentityField("email", "notanemail")).not.toBeNull();
    expect(validateIdentityField("email", "a@b")).not.toBeNull();
  });
});

describe("parseProfileEdit", () => {
  it("requires a first name and caps bio length", () => {
    expect(parseProfileEdit({ firstName: "", bio: "" }).errors.firstName).toBeTruthy();
    expect(parseProfileEdit({ firstName: "A", bio: "x".repeat(241) }).errors.bio).toBeTruthy();
    const ok = parseProfileEdit({ firstName: "Mat", bio: "hi", avatarPreset: "3" });
    expect(ok.errors).toEqual({});
    expect(ok.input.avatarPreset).toBe(3);
  });

  it("treats an empty avatar preset as null (default identicon)", () => {
    const r = parseProfileEdit({ firstName: "Mat", avatarPreset: "" });
    expect(r.input.avatarPreset).toBeNull();
  });

  it("rejects an out-of-range avatar preset", () => {
    expect(parseProfileEdit({ firstName: "Mat", avatarPreset: "999" }).errors.avatarPreset).toBeTruthy();
  });
});

describe("telegramPublicRef", () => {
  it("is stable per Telegram id and null for none", () => {
    expect(telegramPublicRef(null)).toBeNull();
    expect(telegramPublicRef("123456")).toBe(telegramPublicRef("123456"));
    expect(telegramPublicRef("123456")).not.toBe(telegramPublicRef("654321"));
  });

  it("is a short hex string (not the raw id)", () => {
    const ref = telegramPublicRef("123456789");
    expect(ref).toMatch(/^[0-9a-f]{16}$/);
    expect(ref).not.toContain("123456789");
  });
});

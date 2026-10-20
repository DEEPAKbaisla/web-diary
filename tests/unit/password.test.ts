import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password hashing", () => {
  it("produces an Argon2id hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("never stores the plain-text password", async () => {
    const plain = "correct horse battery staple";
    const hash = await hashPassword(plain);
    expect(hash).not.toContain(plain);
  });

  it("salts the hash so identical passwords differ", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");
    expect(first).not.toBe(second);
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("OwnerPass123!");
    await expect(
      verifyPassword({ password: "OwnerPass123!", hash }),
    ).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("OwnerPass123!");
    await expect(
      verifyPassword({ password: "WrongPass123!", hash }),
    ).resolves.toBe(false);
  });

  it("returns false for a malformed hash instead of throwing", async () => {
    await expect(
      verifyPassword({ password: "anything", hash: "not-a-hash" }),
    ).resolves.toBe(false);
  });
});

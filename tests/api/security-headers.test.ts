import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

async function resolveHeaders(): Promise<Map<string, string>> {
  const raw = nextConfig.headers;
  const rules = (
    typeof raw === "function" ? await raw() : (raw ?? [])
  ) as HeaderRule[];

  const map = new Map<string, string>();
  for (const rule of rules) {
    for (const header of rule.headers) {
      map.set(header.key, header.value);
    }
  }
  return map;
}

describe("security headers", () => {
  it("sets nosniff to prevent MIME sniffing", async () => {
    const headers = await resolveHeaders();
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets a referrer policy", async () => {
    const headers = await resolveHeaders();
    expect(headers.get("Referrer-Policy")).toBeTruthy();
  });

  it("blocks framing", async () => {
    const headers = await resolveHeaders();
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("restricts powerful browser features", async () => {
    const headers = await resolveHeaders();
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("keeps the native argon2 module out of the server bundle", () => {
    expect(nextConfig.serverExternalPackages).toContain("@node-rs/argon2");
  });
});

import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/lib/csrf";

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/trips", { headers });
}

describe("isSameOriginRequest", () => {
  it("accepts a matching origin", () => {
    expect(
      isSameOriginRequest(
        request({ origin: "http://localhost:3000", host: "localhost:3000" }),
      ),
    ).toBe(true);
  });

  it("rejects a foreign origin", () => {
    expect(
      isSameOriginRequest(
        request({ origin: "https://evil.example.com", host: "localhost:3000" }),
      ),
    ).toBe(false);
  });

  it("rejects a different port on the same host", () => {
    expect(
      isSameOriginRequest(
        request({ origin: "http://localhost:9999", host: "localhost:3000" }),
      ),
    ).toBe(false);
  });

  it("allows a request without an origin header", () => {
    expect(isSameOriginRequest(request({ host: "localhost:3000" }))).toBe(true);
  });

  it("rejects a request without a host header", () => {
    expect(isSameOriginRequest(request({ origin: "http://localhost:3000" }))).toBe(
      false,
    );
  });

  it("rejects a malformed origin header", () => {
    expect(
      isSameOriginRequest(
        request({ origin: "not-a-url", host: "localhost:3000" }),
      ),
    ).toBe(false);
  });
});

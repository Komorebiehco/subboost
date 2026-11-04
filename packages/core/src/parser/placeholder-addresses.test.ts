import { describe, expect, it } from "vitest";
import { hasDocumentationPlaceholderNodes } from "./placeholder";
import type { ParsedNode } from "../types/node";

const node = (server: string): ParsedNode => ({
  type: "ss", name: "test", server, port: 443, cipher: "aes-128-gcm", password: "test",
});

describe("subscription documentation address detection", () => {
  it.each(["192.0.2.0", "192.0.2.255", "198.51.100.42", "203.0.113.10", "2001:db8::1", "[2001:0db8::1]"])(
    "rejects non-routable documentation address %s",
    (server) => expect(hasDocumentationPlaceholderNodes([node(server)])).toBe(true)
  );

  it.each(["example.com", "192.0.3.10", "198.51.101.10", "203.0.114.10", "1.1.1.1", "2001:4860::1"])(
    "does not label %s as a documentation address",
    (server) => expect(hasDocumentationPlaceholderNodes([node(server)])).toBe(false)
  );

  it("detects a replaced address mixed into an otherwise usable source", () => {
    expect(hasDocumentationPlaceholderNodes([node("example.com"), node("203.0.113.1")])).toBe(true);
    expect(hasDocumentationPlaceholderNodes([])).toBe(false);
  });
});

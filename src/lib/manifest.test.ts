import { describe, it, expect } from "bun:test";
import { parseManifestVersion } from "./manifest";

describe("parseManifestVersion", () => {
  it("reads a string version", () => {
    expect(parseManifestVersion({ version: "2026.01" })).toBe("2026.01");
  });

  it("stringifies a numeric version", () => {
    expect(parseManifestVersion({ version: 2 })).toBe("2");
    expect(parseManifestVersion({ version: 2026 })).toBe("2026");
  });

  it("handles a float version", () => {
    expect(parseManifestVersion({ version: 1.5 })).toBe("1.5");
  });

  it("returns unknown when version is missing", () => {
    expect(parseManifestVersion({})).toBe("unknown");
  });

  it("returns unknown when version is null", () => {
    expect(parseManifestVersion({ version: null })).toBe("unknown");
  });

  it("returns unknown when version is a boolean", () => {
    expect(parseManifestVersion({ version: true })).toBe("unknown");
  });

  it("returns unknown when version is an object", () => {
    expect(parseManifestVersion({ version: { major: 1 } })).toBe("unknown");
  });

  it("returns unknown for non-object input", () => {
    expect(parseManifestVersion("not an object")).toBe("unknown");
    expect(parseManifestVersion(null)).toBe("unknown");
    expect(parseManifestVersion(undefined)).toBe("unknown");
    expect(parseManifestVersion(42)).toBe("unknown");
  });

  it("returns unknown for an array (arrays are not manifest objects)", () => {
    expect(parseManifestVersion(["1"])).toBe("unknown");
  });

  it("ignores other fields", () => {
    expect(
      parseManifestVersion({ version: "v9", name: "tusome", packs: 3 }),
    ).toBe("v9");
  });
});

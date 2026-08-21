import { describe, it, expect } from "bun:test";
import {
  ADMIN_ENTRY_LABEL,
  adminEntryLabel,
  CTA_VERBS,
  isCtaVerb,
} from "./admin-entry";

describe("admin entry label (subtlety principle)", () => {
  it("returns a short, neutral label", () => {
    const label = adminEntryLabel();
    expect(label).toBe(ADMIN_ENTRY_LABEL);
    // Short — a long label reads as a prominent affordance.
    expect(label.length).toBeLessThanOrEqual(16);
  });

  it("is not a primary CTA verb", () => {
    // The admin entry must not read as a primary action ("Buy", "Continue",
    // etc.) — the PIN is the gate, the entry just has to be findable.
    expect(isCtaVerb(adminEntryLabel())).toBe(false);
  });

  it("every CTA_VERBS entry is detected as a CTA verb", () => {
    // Sanity check on the helper itself — a real primary CTA would be flagged.
    for (const v of CTA_VERBS) {
      expect(isCtaVerb(v)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isCtaVerb("buy")).toBe(true);
    expect(isCtaVerb("CONTINUE")).toBe(true);
  });

  it("a neutral label is not a CTA verb", () => {
    expect(isCtaVerb("Settings")).toBe(false);
    expect(isCtaVerb("Admin")).toBe(false);
    expect(isCtaVerb("About")).toBe(false);
  });
});

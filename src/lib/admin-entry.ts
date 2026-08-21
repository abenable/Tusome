// The admin entry control — a deliberately subtle affordance.
//
// Admin-entry principle (07-updates-and-security.md): the PIN is the gate, not
// the entry control. A bored student should not stumble into the admin screen
// in the first minute, so the entry is a small, muted gear link — not a large
// labelled pill CTA. The real protection is <PinGate>; this just has to be
// findable by a teacher who knows it's there.
//
// `ADMIN_ENTRY_LABEL` is kept short and neutral on purpose: it is NOT a
// primary-CTA verb ("Get started", "Continue", "Sign in", "Buy", "Add",
// "Start"). A unit test asserts the label stays short and non-CTA so a later
// edit can't quietly promote the admin entry into a big button.

export const ADMIN_ENTRY_LABEL = "Settings";

/** The visible label on the admin entry control. Pure, for unit tests. */
export function adminEntryLabel(): string {
  return ADMIN_ENTRY_LABEL;
}

/**
 * Words the admin entry label must NEVER be. These are the DESIGN.md primary
 * CTA verbs — a label matching one would read as a prominent action and
 * violate the subtlety principle. Kept as a pure list so the unit test can
 * assert against it without rendering.
 */
export const CTA_VERBS = [
  "Get started",
  "Continue",
  "Sign in",
  "Log in",
  "Buy",
  "Add",
  "Start",
  "Begin",
  "Go",
] as const;

/** True if `label` would read as a primary CTA verb (case-insensitive). */
export function isCtaVerb(label: string): boolean {
  const lower = label.toLowerCase();
  return CTA_VERBS.some((v) => v.toLowerCase() === lower);
}

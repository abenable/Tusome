// unDraw illustrations (MIT licence, free for commercial use, no attribution
// required — undraw.co/license), one per subject, vendored under
// public/illustrations/ so they load offline under CSP `default-src 'self'`.
// Transparent SVGs — meant to sit on each subject's own accent.tint band.

import type { Subject } from "@/lib/subjects"

export const SUBJECT_ILLUSTRATIONS: Record<Subject, string> = {
  physics: "/illustrations/physics.svg",
  chemistry: "/illustrations/chemistry.svg",
  biology: "/illustrations/biology.svg",
  mathematics: "/illustrations/mathematics.svg",
}

// Student progress dashboard — `/dashboard`.
//
// Shows the CURRENT student's topics (joined with installed packs),
// completed/started counts, best score per topic (computed from
// quiz_attempts — never stored), and one "Continue where you left off" card.
// No comparisons, no leaderboards, no other students' data.
//
// Guest (studentId null) is a teaser state — Guest records nothing, so there is
// nothing to show. See docs/plan/06-app-features.md §"Dashboard" and
// 00-decisions §4 (no student passwords; a name picker IS the whole login).
//
// W6: a PIN-gated teacher view lives here too, behind a deliberately subtle
// entry (the admin-entry principle — NOT a big button a bored student finds
// in a minute). The teacher view itself is <TeacherDashboard packs=…/>, which
// renders its own <PinGate>; the route just toggles which surface is shown.
// No new route file → no route-tree regeneration. The loader signature is
// unchanged ({packs}).

import { useState, type JSX } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { loadPacksCached } from "@/content/loader";
import type { PackT } from "@/content/schema";
import { useStudent } from "@/lib/student-context";
import { EmptyState } from "@/components/EmptyState";
import { StudentDashboard } from "@/components/StudentDashboard";
import { TeacherDashboard } from "@/components/TeacherDashboard";

export const Route = createFileRoute("/dashboard")({
  // Load installed packs once via the shared TanStack Query cache (one
  // filesystem walk for subject/topic/quiz/dashboard routes). The loader only
  // needs the packs; the component pulls progress + best scores from the DB
  // in an effect so a stale cache never blocks navigation.
  loader: async ({ context }): Promise<{ packs: PackT[] }> => {
    const { queryClient } = context;
    const { packs } = await loadPacksCached(queryClient);
    return { packs };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { studentId } = useStudent();
  const { packs } = Route.useLoaderData();
  // Default: student view. The teacher view is toggled on by a small, subtle
  // control at the bottom — it's an admin affordance, not a primary action.
  const [view, setView] = useState<"student" | "teacher">("student");

  if (view === "teacher") {
    return (
      <div className="flex flex-col gap-6">
        <button
          type="button"
          onClick={() => setView("student")}
          className="inline-flex min-h-[44px] w-fit items-center rounded-[8px] px-2 font-sans text-[14px] text-brand hover:underline"
        >
          Back to student view
        </button>
        <TeacherDashboard packs={packs} />
      </div>
    );
  }

  // Guest: no student chosen as a real person — Guest records nothing, so
  // show a teaser rather than computing for nobody. (status is "ready" here;
  // the __root gate has already handled "loading" / "needs-pick".)
  if (studentId === null) {
    return (
      <>
        <EmptyState
          title="Sign in to see your progress"
          message="Choose your name to track your quiz scores."
        />
        <TeacherEntry onActivate={() => setView("teacher")} />
      </>
    );
  }

  // No installed packs: nothing to show progress against.
  if (packs.length === 0) {
    return (
      <>
        <EmptyState
          title="No topics installed yet"
          message="Ask your teacher or admin to install content packs."
        />
        <TeacherEntry onActivate={() => setView("teacher")} />
      </>
    );
  }

  return (
    <>
      <StudentDashboard studentId={studentId} packs={packs} />
      <TeacherEntry onActivate={() => setView("teacher")} />
    </>
  );
}

/**
 * The subtle teacher entry — a small, low-contrast text link at the bottom of
 * the dashboard. Per the admin-entry principle (07-updates-and-security.md):
 * the PIN is the gate, not the entry control; this just has to be findable by
 * a teacher who knows it's there and not advertised to a wandering student.
 */
function TeacherEntry({ onActivate }: { onActivate: () => void }): JSX.Element {
  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={onActivate}
        className="inline-flex min-h-[44px] items-center rounded-[8px] px-1 font-sans text-[14px] text-ink-3 hover:text-brand"
        aria-label="Teacher view"
      >
        Teacher view
      </button>
    </div>
  );
}

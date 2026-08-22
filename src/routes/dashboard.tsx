// Student progress dashboard — `/dashboard`.
//
// Shows the CURRENT student's topics (joined with installed packs) and
// completed/started counts, plus one "Continue where you left off" card.
// No comparisons, no leaderboards, no other students' data.
//
// Guest (studentId null) is a teaser state — Guest records nothing, so there is
// nothing to show. See docs/plan/06-app-features.md §"Dashboard" and
// 00-decisions §4 (no student passwords; a name picker IS the whole login).

import type { JSX } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { loadPacksCached } from "@/content/loader";
import type { PackT } from "@/content/schema";
import { useStudent } from "@/lib/student-context";
import { EmptyState } from "@/components/EmptyState";
import { StudentDashboard } from "@/components/StudentDashboard";

export const Route = createFileRoute("/dashboard")({
  // Load installed packs once via the shared TanStack Query cache (one
  // filesystem walk for subject/topic/dashboard routes). The loader only
  // needs the packs; the component pulls progress from the DB in an effect
  // so a stale cache never blocks navigation.
  loader: async ({ context }): Promise<{ packs: PackT[] }> => {
    const { queryClient } = context;
    const { packs } = await loadPacksCached(queryClient);
    return { packs };
  },
  component: DashboardPage,
});

function DashboardPage(): JSX.Element {
  const { studentId } = useStudent();
  const { packs } = Route.useLoaderData();

  // Guest: no student chosen as a real person — Guest records nothing, so
  // show a teaser rather than computing for nobody. (status is "ready" here;
  // the __root gate has already handled "loading" / "needs-pick".)
  if (studentId === null) {
    return (
      <EmptyState
        title="Sign in to see your progress"
        message="Choose your name to track your progress."
      />
    );
  }

  // No installed packs: nothing to show progress against.
  if (packs.length === 0) {
    return (
      <EmptyState
        title="No topics installed yet"
        message="Ask your teacher or admin to install content packs."
      />
    );
  }

  return <StudentDashboard studentId={studentId} packs={packs} />;
}

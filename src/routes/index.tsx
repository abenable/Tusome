import { createFileRoute, Link } from "@tanstack/react-router"

import { SUBJECTS, SUBJECT_LABELS, type Subject } from "@/lib/subjects"

// Subject picker — the landing page. Lists the four hardcoded subjects as
// links to /$subject. Non-physics subjects route to their topic-list page,
// which renders "no topics yet" (the content packs aren't authored yet).
// See docs/plan/04-vertical-slice.md step 1 and 00-decisions.md §5 (Physics
// first).

export const Route = createFileRoute("/")({
  component: SubjectPicker,
})

function SubjectPicker() {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-[40px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
          CBCLab
        </h1>
        <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
          Lower-secondary CBC simulations and quizzes. Pick a subject to begin.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SUBJECTS.map((subject: Subject) => (
          <li key={subject}>
            <Link
              to="/$subject"
              params={{ subject }}
              className="flex min-h-[88px] items-center rounded-[11px] border border-hairline bg-card px-6 text-[17px] font-medium text-[#1d1d1f] transition-colors hover:bg-[#f5f5f7]"
            >
              {SUBJECT_LABELS[subject]}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

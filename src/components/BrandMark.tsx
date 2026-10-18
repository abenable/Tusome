// The Tusome mark: a sun rising over an open book — or a reader bent over one,
// depending on how you look at it. "Tusome" is Swahili for "let's read".
//
// Drawn inline (not an <img>) so it follows the colour tokens. The same shapes,
// with literal hex fills, live in public/favicon.svg and
// src-tauri/icons/icon.svg; change all three together.

export function BrandMark({
  size = 34,
  wordmark = true,
  tone = "dark",
}: {
  size?: number
  wordmark?: boolean
  /** Wordmark colour: "dark" on light surfaces, "light" on the sidebar. */
  tone?: "dark" | "light"
}) {
  return (
    <span className="flex items-center gap-[10px]">
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        aria-hidden
        className="shrink-0"
      >
        <rect width="64" height="64" rx="16" fill="var(--color-sun)" />
        <circle cx="32" cy="21.5" r="7" fill="var(--color-ink)" />
        <path
          d="M30.5 49V35.2C25.6 31.6 18.8 30.6 11.5 31.6v14c7.3-1 14.1 0 19 3.4z"
          fill="var(--color-ink)"
        />
        <path
          d="M33.5 49V35.2c4.9-3.6 11.7-4.6 19-3.6v14c-7.3-1-14.1 0-19 3.4z"
          fill="var(--color-ink)"
        />
      </svg>
      {wordmark ? (
        <span
          className={`whitespace-nowrap font-heading text-[22px] font-extrabold tracking-[-0.02em] ${
            tone === "light" ? "text-white" : "text-ink"
          }`}
        >
          Tusome
        </span>
      ) : null}
    </span>
  )
}

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a SQLite `datetime('now')` stamp ("YYYY-MM-DD HH:MM:SS", UTC with no
 * zone marker) in the machine's local time. Parsing it bare would read it as
 * local time — three hours early in Uganda (UTC+3).
 */
export function formatDbTime(utc: string): string {
  const d = new Date(utc.replace(" ", "T") + "Z")
  if (Number.isNaN(d.getTime())) return utc
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

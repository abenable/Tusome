import { describe, it, expect } from 'bun:test'
import { cn, formatDbTime } from '@/lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })
})

describe('formatDbTime', () => {
  it('reads the SQLite stamp as UTC, not local time', () => {
    const local = new Date(Date.UTC(2026, 9, 18, 8, 31, 0)).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
    expect(formatDbTime('2026-10-18 08:31:00')).toBe(local)
  })

  it('passes an unparseable value through unchanged', () => {
    expect(formatDbTime('not a date')).toBe('not a date')
  })
})

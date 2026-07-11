import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "ghcr.io/org/name:tag" → "tag" for compact display. */
export function imageTag(image: string) {
  const i = image.lastIndexOf(':')
  return i === -1 ? image : image.slice(i + 1)
}

/** Page numbers with ellipsis gaps, e.g. 1 … 4 5 6 … 12. */
export function pageNumbers(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const wanted = [...new Set([1, current - 1, current, current + 1, total])]
    .filter(p => p >= 1 && p <= total)
    .sort((a, b) => a - b)
  const out: Array<number | '…'> = []
  let prev = 0
  for (const p of wanted) {
    if (p - prev > 1) out.push('…')
    out.push(p)
    prev = p
  }
  return out
}

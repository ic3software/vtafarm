import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ImageOption } from "@/lib/api"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "ghcr.io/org/name:tag" → "tag" for compact display. */
export function imageTag(image: string) {
  const i = image.lastIndexOf(':')
  return i === -1 ? image : image.slice(i + 1)
}

/**
 * Dropdown label for a registry image: the tag, the channel(s) pointing at
 * it, then the build date, e.g. "0.10.0-cf959b0 [nightly] 2026-10-15".
 */
export function imageLabel(img: ImageOption): string {
  let s = img.tag
  if (img.latest) s += ' [latest]'
  if (img.nightly) s += ' [nightly]'
  if (img.main) s += ' [main]'
  if (img.created) s += ' ' + img.created.slice(0, 10)
  return s
}

export type ImageChangeDirection = 'upgrade' | 'downgrade' | 'change'

function numericVersion(tag: string): [number, number, number] | null {
  const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+]|$)/)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

function compareNumericVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/** Compare immutable images without relying on the dropdown's channel-first order. */
export function imageChangeDirection(images: ImageOption[], from: string, to: string): ImageChangeDirection {
  const fromOption = images.find(image => image.image === from)
  const toOption = images.find(image => image.image === to)
  const fromTime = fromOption?.created ? Date.parse(fromOption.created) : Number.NaN
  const toTime = toOption?.created ? Date.parse(toOption.created) : Number.NaN

  if (Number.isFinite(fromTime) && Number.isFinite(toTime) && fromTime !== toTime) {
    return toTime > fromTime ? 'upgrade' : 'downgrade'
  }

  const fromVersion = numericVersion(fromOption?.tag ?? imageTag(from))
  const toVersion = numericVersion(toOption?.tag ?? imageTag(to))
  if (fromVersion && toVersion) {
    const comparison = compareNumericVersions(toVersion, fromVersion)
    if (comparison !== 0) return comparison > 0 ? 'upgrade' : 'downgrade'
  }

  // A retired current tag may no longer have metadata, but moving to the
  // registry's current stable release is still a meaningful upgrade.
  if (toOption?.latest && !fromOption?.latest) return 'upgrade'
  return 'change'
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

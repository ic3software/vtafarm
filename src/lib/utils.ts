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

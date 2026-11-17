type BrandMarkProps = {
  /** Width and height in pixels. */
  size?: number
}

/**
 * Trustie, the VTA Farm mark. The drawing is the same as public/favicon.svg
 * and the mark on the public site; the antenna follows the theme accent.
 */
export function BrandMark({ size = 34 }: BrandMarkProps) {
  return (
    <svg
      className="brand-mark"
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 256 256"
    >
      <rect width="256" height="256" rx="60" fill="#2E8C85" />
      <line x1="128" y1="62" x2="128" y2="44" stroke="#111010" strokeWidth="10" strokeLinecap="round" />
      <circle cx="128" cy="34" r="16" fill="var(--vtafarm-accent)" stroke="#111010" strokeWidth="7" />
      <circle cx="128" cy="34" r="5" fill="#2E8C85" />
      <rect x="32" y="58" width="192" height="148" rx="62" fill="#FFFFFF" opacity=".16" />
      <rect x="44" y="68" width="168" height="128" rx="52" fill="#141A1A" stroke="#111010" strokeWidth="6" />
      <rect x="86" y="104" width="28" height="40" rx="14" fill="#7FE3C4" />
      <rect x="142" y="104" width="28" height="40" rx="14" fill="#7FE3C4" />
      <path d="M108 162 Q128 176 148 162" fill="none" stroke="#7FE3C4" strokeWidth="10" strokeLinecap="round" />
      <circle cx="128" cy="226" r="17" fill="#F7F5F0" stroke="#111010" strokeWidth="5" />
      <path d="M120 226 L126 232 L137 220" fill="none" stroke="#9D0105" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

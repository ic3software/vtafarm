function BrandMark() {
  return (
    <span
      className="relative flex h-[22px] w-[22px] flex-none overflow-hidden rounded-[6px]"
      style={{ background: 'var(--vtafarm-ink)' }}
      aria-hidden="true"
    >
      <span className="absolute inset-[5px] rotate-45 rounded-[2px]" style={{ background: 'var(--vtafarm-accent)' }} />
      <span className="absolute left-2 top-2 h-1.5 w-1.5 rotate-45 rounded-[1px]" style={{ background: 'var(--vtafarm-ink)' }} />
    </span>
  )
}

const LINKS = [
  {
    heading: 'Product',
    items: [
      { label: 'Features', href: '#features' },
      { label: 'How it works', href: '#how' },
      { label: 'Changelog', href: 'https://github.com/OpenVTC/verifiable-trust-infrastructure/releases', external: true },
    ],
  },
  {
    heading: 'Developers',
    items: [
      { label: 'Docs', href: 'https://github.com/OpenVTC/wiki', external: true },
      { label: 'GitHub', href: 'https://github.com/OpenVTC/verifiable-trust-infrastructure', external: true },
    ],
  },
  {
    heading: 'Company',
    items: [
      { label: 'About', href: '#' },
      { label: 'Security', href: '#' },
      { label: 'Privacy', href: '#' },
      { label: 'Contact', href: '#' },
    ],
  },
]

export function FooterSection() {
  return (
    <footer
      className="mt-20 pb-9"
      style={{ borderTop: '1px solid var(--vtafarm-line)', paddingTop: 56 }}
    >
      <div className="section-wrap">
        <div className="grid grid-cols-2 gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          {/* Brand column */}
          <div className="col-span-2 lg:col-span-1">
            <a href="#" className="flex items-center gap-2.5 text-[15px] font-medium tracking-[-0.005em]">
              <BrandMark />
              VTA Farm
            </a>
            <p className="mt-4 max-w-[30ch] text-[14px] leading-[1.55]" style={{ color: 'var(--vtafarm-ink-3)' }}>
              Verifiable trust infrastructure for the open internet. Built on open standards.
              Engineered for sovereignty.
            </p>
          </div>

          {/* Link columns */}
          {LINKS.map((col) => (
            <div key={col.heading}>
              <h4 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--vtafarm-ink-3)' }}>
                {col.heading}
              </h4>
              <ul className="flex list-none flex-col gap-2.5 p-0 m-0">
                {col.items.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="text-[14.5px] transition-colors duration-150"
                      style={{ color: 'var(--vtafarm-ink-2)' }}
                      onMouseOver={e => ((e.currentTarget as HTMLElement).style.color = 'var(--vtafarm-ink)')}
                      onMouseOut={e => ((e.currentTarget as HTMLElement).style.color = 'var(--vtafarm-ink-2)')}
                      {...(('external' in item && item.external) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Legal */}
        <div
          className="mt-14 flex flex-wrap items-center justify-between gap-3 pt-7 font-mono text-[11px] uppercase tracking-[0.12em]"
          style={{ borderTop: '1px solid var(--vtafarm-line-2)', color: 'var(--vtafarm-ink-3)' }}
        >
          <span>© 2026 VTA Farm</span>
          <span>did:webvh · W3C standards</span>
        </div>
      </div>
    </footer>
  )
}

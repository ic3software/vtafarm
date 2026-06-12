import { useState } from 'react'

const NAV_LINKS = [
  { label: 'How it works', href: '#how' },
  { label: 'Features', href: '#features' },
  { label: 'Why VTA Farm', href: '#benefits' },
  { label: 'Docs', href: 'https://github.com/OpenVTC/wiki', external: true },
]

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

export function NavBar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const close = () => setMenuOpen(false)

  const lineBase: React.CSSProperties = {
    display: 'block',
    width: 17,
    height: 1.8,
    borderRadius: 2,
    background: 'var(--vtafarm-ink)',
    transition: 'transform 260ms cubic-bezier(.4,.1,.2,1), opacity 200ms',
    flexShrink: 0,
  }

  return (
    <div
      className="sticky top-0 z-50"
      style={{
        background: 'color-mix(in srgb, var(--vtafarm-bg) 88%, transparent)',
        backdropFilter: 'saturate(140%) blur(14px)',
        WebkitBackdropFilter: 'saturate(140%) blur(14px)',
        borderBottom: '1px solid color-mix(in srgb, var(--vtafarm-line) 70%, transparent)',
      }}
    >
      {/* Main bar */}
      <div className="section-wrap flex h-16 items-center justify-between">
        <a href="#" className="flex items-center gap-2.5 text-[15px] font-medium tracking-[-0.005em]">
          <BrandMark />
          VTA Farm
        </a>

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV_LINKS.map(({ label, href, external }) => (
            <a key={label} href={href} className="nav-link" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{label}</a>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          {/* Desktop CTA */}
          <a
            href="/portal"
            className="btn-ink group hidden items-center gap-2 rounded-full px-5 py-3 text-[14.5px] font-medium md:flex"
          >
            Open Portal
            <span className="inline-block transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">→</span>
          </a>

          {/* Mobile burger — 3 animated lines */}
          <button
            className="flex h-10 w-10 flex-col items-center justify-center gap-[5px] rounded-[10px] md:hidden"
            style={{ border: '1px solid var(--vtafarm-line)', background: 'transparent', cursor: 'pointer' }}
            onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <span style={{ ...lineBase, transform: menuOpen ? 'translateY(5.8px) rotate(45deg)' : 'none' }} />
            <span style={{ ...lineBase, opacity: menuOpen ? 0 : 1 }} />
            <span style={{ ...lineBase, transform: menuOpen ? 'translateY(-5.8px) rotate(-45deg)' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Mobile menu — drop animation */}
      {menuOpen && (
        <div
          className="animate-menu-drop flex flex-col md:hidden"
          style={{
            padding: '8px clamp(20px,4vw,56px) 20px',
            borderTop: '1px solid var(--vtafarm-line-2)',
            background: 'var(--vtafarm-bg)',
          }}
        >
          {NAV_LINKS.map(({ label, href, external }) => (
            <a
              key={label}
              href={href}
              className="transition-colors duration-150"
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              style={{
                fontSize: 16,
                color: 'var(--vtafarm-ink-2)',
                padding: '14px 4px',
                borderBottom: '1px solid var(--vtafarm-line-2)',
                display: 'block',
              }}
              onMouseOver={e => ((e.currentTarget as HTMLElement).style.color = 'var(--vtafarm-ink)')}
              onMouseOut={e => ((e.currentTarget as HTMLElement).style.color = 'var(--vtafarm-ink-2)')}
              onClick={close}
            >
              {label}
            </a>
          ))}
          <a
            href="/portal"
            className="btn-ink flex items-center justify-center gap-2 rounded-full text-[15px] font-medium"
            style={{ marginTop: 14, padding: '14px 20px' }}
            onClick={close}
          >
            Open Portal →
          </a>
        </div>
      )}
    </div>
  )
}

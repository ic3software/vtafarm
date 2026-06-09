import { useEffect, useLayoutEffect, useRef } from 'react'

const DID_HTML =
  '<span style="color:#c6b8ff">did:webvh</span>' +
  ':QmNU7ZcZz2odb3SXCrXHV1SnqjV296haTGPPDvQZd' +
  '<span style="color:#c6b8ff">SVTi6</span>' +
  ':<span style="color:#8f86c9;border-bottom:1px dashed rgba(198,184,255,0.5);padding-bottom:1px">' +
  '&lt;bring-your-domain&gt;</span>' +
  ':<span style="color:#c6b8ff">vta</span>'

function scrambleDID(el: HTMLElement) {
  const finalHTML = el.innerHTML
  const finalText = el.textContent || ''
  const glyphs = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const fixed: Record<string, boolean> = { ' ': true, ':': true, '.': true, '<': true, '>': true, '-': true }
  const chars = finalText.split('')
  let frame = 0
  const reveal = chars.map((_, i) => 6 + Math.floor(i * 0.7))
  const total = reveal[reveal.length - 1] + 2

  const timer = setInterval(() => {
    frame++
    let out = ''
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i]
      if (fixed[c]) { out += c; continue }
      out += frame >= reveal[i] ? c : glyphs[Math.floor(Math.random() * glyphs.length)]
    }
    el.textContent = out
    if (frame >= total) {
      clearInterval(timer)
      el.innerHTML = finalHTML
    }
  }, 45)

  return timer
}

function IdentityCard() {
  const didRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    document.documentElement.classList.add('hero-anim', 'hero-run')
    return () => {
      document.documentElement.classList.remove('hero-anim', 'hero-run', 'hero-float')
    }
  }, [])

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    if (didRef.current) scrambleDID(didRef.current)
    const t = setTimeout(() => document.documentElement.classList.add('hero-float'), 1450)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className="id-card relative ml-auto w-full max-w-[460px] overflow-hidden rounded-[22px] p-7 text-white"
      style={{
        aspectRatio: '1 / 1.05',
        background: 'var(--cipher-bg-dark)',
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.04) inset, 0 30px 60px -30px rgba(20,18,40,0.45), 0 8px 24px -12px rgba(0,0,0,0.25)',
        isolation: 'isolate',
      }}
      aria-hidden="true"
    >
      {/* Gradient glow */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 50% at 85% 0%, rgba(107,78,255,0.45), transparent 60%), radial-gradient(40% 40% at 0% 100%, rgba(107,78,255,0.18), transparent 70%)',
        }}
      />
      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse at 50% 30%, black, transparent 75%)',
        }}
      />

      {/* Top row */}
      <div className="flex items-start justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-white/60">
        <span>CIPHER · VTA</span>
        <span className="flex items-center gap-2 text-white/85">
          <span className="h-[7px] w-[7px] flex-none rounded-full animate-pulse-dot" style={{ background: '#34d399' }} />
          Live · Attested
        </span>
      </div>

      {/* Body */}
      <div className="mt-10 flex flex-col gap-4">
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">Holder</div>
          <div className="font-serif text-[38px] leading-[1.05] tracking-[-0.01em]">Olivia Bennett</div>
        </div>
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
            Decentralized identifier
          </div>
          <div
            ref={didRef}
            className="rounded-[10px] px-3.5 py-3 font-mono text-[11.5px] leading-[1.55]"
            style={{
              wordBreak: 'break-all',
              color: 'rgba(255,255,255,0.72)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            dangerouslySetInnerHTML={{ __html: DID_HTML }}
          />
        </div>
      </div>

      {/* Bottom */}
      <div className="absolute bottom-7 left-7 right-7 flex items-end justify-between">
        <div className="credchips flex gap-1.5">
          {[
            { label: 'Verified human', accent: true },
            { label: 'EU resident', accent: false },
            { label: 'Pro member', accent: false },
          ].map(({ label, accent }) => (
            <span
              key={label}
              className="chip rounded-full px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
              style={
                accent
                  ? { background: 'rgba(107,78,255,0.22)', border: '1px solid rgba(167,148,255,0.35)', color: '#d8cdff' }
                  : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }
              }
            >
              {label}
            </span>
          ))}
        </div>
        {/* Seal */}
        <div
          className="relative grid h-14 w-14 place-items-center rounded-full"
          style={{ border: '1px solid rgba(255,255,255,0.18)' }}
          aria-hidden="true"
        >
          <div className="absolute animate-spin-slow rounded-full" style={{ inset: 4, border: '1px dashed rgba(255,255,255,0.18)' }} />
          <div className="absolute animate-spin-slower rounded-full" style={{ inset: 10, border: '1px solid rgba(255,255,255,0.08)' }} />
          <span className="font-serif text-xl" style={{ color: '#c6b8ff' }}>✦</span>
        </div>
      </div>
    </div>
  )
}

const logoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 22,
  fontStyle: 'italic',
  letterSpacing: '-0.01em',
  color: 'var(--cipher-ink-2)',
  opacity: 0.7,
  cursor: 'default',
  transition: 'opacity 200ms',
}

function TrustBand() {
  return (
    <div
      className="trust-band flex flex-wrap items-center justify-between gap-10 py-7"
      style={{ borderTop: '1px solid var(--cipher-line)', borderBottom: '1px solid var(--cipher-line)' }}
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--cipher-ink-3)' }}>
        Trusted by communities at
      </span>
      <div className="flex flex-wrap items-center gap-10">
        <span
          style={logoStyle}
          onMouseOver={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
          onMouseOut={e => ((e.currentTarget as HTMLElement).style.opacity = '0.7')}
        >
          <strong style={{ fontStyle: 'normal', fontWeight: 400, letterSpacing: '-0.02em' }}>IC3</strong>
          {' '}Software
        </span>
        <span
          style={logoStyle}
          onMouseOver={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
          onMouseOut={e => ((e.currentTarget as HTMLElement).style.opacity = '0.7')}
        >
          Affinidi
        </span>
      </div>
    </div>
  )
}

export function HeroSection() {
  return (
    <section style={{ paddingTop: 'clamp(56px, 9vh, 110px)', paddingBottom: 'clamp(72px, 10vh, 130px)' }}>
      <div className="section-wrap">
        {/* Hero grid */}
        <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
          {/* Copy */}
          <div>
            <div className="eyebrow hero-el hero-eyebrow">
              <span className="dot" />
              Verifiable Trust Infrastructure
            </div>

            <h1
              className="my-5 font-serif font-normal leading-[1.02] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(56px, 8.4vw, 124px)' }}
            >
              <span className="line-mask">
                <span className="line-inner">Identity that</span>
              </span>
              <span className="line-mask">
                <span className="line-inner">
                  <em className="hero-em" style={{ fontStyle: 'italic', color: 'var(--cipher-accent)' }}>
                    proves itself.
                  </em>
                </span>
              </span>
            </h1>

            <p
              className="hero-sub hero-el mb-9 max-w-[46ch] text-xl leading-[1.5]"
              style={{ color: 'var(--cipher-ink-2)' }}
            >
              Cipher is the trust layer for the open internet. Mint cryptographic identities, issue
              verifiable credentials, and prove who you are — without surrendering a single byte you
              didn't choose to share.
            </p>

            <div className="hero-ctas hero-el flex flex-wrap gap-3">
              <a
                href="/portal"
                className="btn-ink group flex items-center gap-2 rounded-full px-5 py-3 text-[14.5px] font-medium"
              >
                Create your VTA
                <span className="inline-block transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">→</span>
              </a>
              <a
                href="#how"
                className="btn-ghost-light flex items-center gap-2 rounded-full px-5 py-3 text-[14.5px] font-medium"
              >
                See how it works
              </a>
            </div>

            {/* Stats */}
            <div
              className="hero-meta hero-el mt-14 flex flex-wrap gap-7 pt-7"
              style={{ borderTop: '1px solid var(--cipher-line)' }}
            >
              {[
                { num: '256-bit', lbl: 'Sovereign keys' },
                { num: 'Zero', lbl: 'Personal data leaked' },
                { num: 'DID-native', lbl: 'W3C standards' },
              ].map(({ num, lbl }) => (
                <div key={lbl} className="flex flex-col gap-1">
                  <div className="font-serif text-[30px] leading-none tracking-[-0.02em]">{num}</div>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: 'var(--cipher-ink-3)' }}>
                    {lbl}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Identity card */}
          <IdentityCard />
        </div>

        {/* Trust band */}
        <div style={{ marginTop: 'clamp(64px, 9vh, 110px)' }}>
          <TrustBand />
        </div>
      </div>
    </section>
  )
}

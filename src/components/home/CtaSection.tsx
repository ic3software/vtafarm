export function CtaSection() {
  return (
    <section id="cta" className="section-pad" style={{ paddingTop: 0 }}>
      <div className="section-wrap">
        <div
          className="relative grid items-center gap-12 overflow-hidden rounded-[24px] lg:grid-cols-[1.4fr_1fr]"
          style={{
            background: 'var(--vtafarm-bg-elev)',
            border: '1px solid var(--vtafarm-line)',
            padding: 'clamp(48px, 7vw, 80px)',
          }}
        >
          {/* Glow */}
          <div
            className="pointer-events-none absolute -right-[100px] -top-[100px] h-[360px] w-[360px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(107,78,255,0.16), transparent 65%)' }}
          />

          <div>
            <div className="eyebrow mb-6">
              <span className="dot" />
              Begin
            </div>
            <h2
              className="mb-4 font-serif font-normal leading-[1.04] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(40px, 5vw, 64px)' }}
            >
              Your next identity is{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--vtafarm-accent)' }}>yours.</em>
            </h2>
            <p className="text-[17px] leading-[1.55]" style={{ color: 'var(--vtafarm-ink-2)', maxWidth: '46ch' }}>
              Open the portal, name your agent, claim a DID. We'll handle the cryptography; you
              handle the proof.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <a
              href="/portal"
              className="btn-ink group flex items-center justify-center gap-2 rounded-full px-5 py-4 text-[15px] font-medium"
            >
              Create your VTA
              <span className="inline-block transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">→</span>
            </a>
            <a
              href="#how"
              className="btn-ghost-light flex items-center justify-center gap-2 rounded-full px-5 py-4 text-[15px] font-medium"
            >
              See it in action
            </a>
            <p className="text-center font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--vtafarm-ink-3)' }}>
              Set up in 2 minutes
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

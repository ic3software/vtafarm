const STEPS = [
  {
    num: '01 / Provision',
    title: 'Spin up an Agent.',
    desc: 'Open the VTA Farm portal, name your VTA, and pick a region. Keys are sealed inside a hardware enclave from the very first instant.',
    next: '01 → 02',
    svg: (
      <svg viewBox="0 0 200 96" fill="none" className="h-full w-full">
        <rect x="40" y="20" width="120" height="56" rx="10" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
        <rect x="56" y="36" width="36" height="6" rx="3" fill="rgba(198,184,255,0.85)" />
        <rect x="56" y="50" width="64" height="4" rx="2" fill="rgba(255,255,255,0.25)" />
        <rect x="56" y="60" width="44" height="4" rx="2" fill="rgba(255,255,255,0.18)" />
        <circle cx="148" cy="42" r="6" fill="#c6b8ff" />
      </svg>
    ),
  },
  {
    num: '02 / Mint',
    title: 'Mint your identity.',
    desc: 'VTA Farm generates your decentralized identifier (DID), signs it cryptographically, and publishes only the parts the world should see.',
    next: '02 → 03',
    svg: (
      <svg viewBox="0 0 200 96" fill="none" className="h-full w-full">
        <circle cx="100" cy="48" r="28" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
        <circle cx="100" cy="48" r="14" fill="#c6b8ff" />
        <path d="M40 48 H68 M132 48 H160" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
        <circle cx="40" cy="48" r="4" fill="rgba(255,255,255,0.55)" />
        <circle cx="160" cy="48" r="4" fill="rgba(255,255,255,0.55)" />
      </svg>
    ),
  },
  {
    num: '03 / Issue',
    title: 'Issue credentials.',
    desc: 'Communities and apps issue verifiable credentials to your agent — memberships, attestations, achievements — all cryptographically signed.',
    next: '03 → 04',
    svg: (
      <svg viewBox="0 0 200 96" fill="none" className="h-full w-full">
        <rect x="30" y="30" width="60" height="36" rx="6" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
        <rect x="110" y="22" width="60" height="36" rx="6" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
        <rect x="110" y="60" width="60" height="14" rx="3" fill="rgba(198,184,255,0.6)" />
        <path d="M90 48 L110 40" stroke="#c6b8ff" strokeWidth="1.4" />
        <path d="M90 48 L110 56" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeDasharray="3 3" />
      </svg>
    ),
  },
  {
    num: '04 / Prove',
    title: 'Prove anything. Reveal nothing.',
    desc: 'Present a zero-knowledge proof to any service. They learn what they need — "over 18", "member in good standing" — and nothing more.',
    next: '04 → done',
    svg: (
      <svg viewBox="0 0 200 96" fill="none" className="h-full w-full">
        <path d="M70 50 l16 16 l44 -36" stroke="#c6b8ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="100" cy="48" r="38" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
        <circle cx="100" cy="48" r="44" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="2 4" />
      </svg>
    ),
  },
]

export function HowItWorks() {
  return (
    <section id="how">
      <div
        className="how-panel text-white"
        style={{
          background: 'var(--vtafarm-bg-dark)',
          padding: 'clamp(72px, 10vh, 110px) clamp(28px, 5vw, 72px)',
        }}
      >
        {/* Section header */}
        <div className="mb-14 grid items-end gap-10 lg:grid-cols-2 lg:gap-20">
          <div>
            <div className="eyebrow mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
              <span className="dot" style={{ background: '#c6b8ff' }} />
              How it works
            </div>
            <h2
              className="font-serif font-normal leading-[1.04] tracking-[-0.02em] text-white"
              style={{ fontSize: 'clamp(40px, 5.2vw, 72px)', maxWidth: '18ch' }}
            >
              Four steps from{' '}
              <em style={{ fontStyle: 'italic', color: '#c6b8ff' }}>silent</em> to{' '}
              <em style={{ fontStyle: 'italic', color: '#c6b8ff' }}>sovereign.</em>
            </h2>
          </div>
          <p className="text-[19px] leading-[1.55] text-white/70" style={{ maxWidth: '56ch' }}>
            Provision your Verifiable Trust Agent from our portal in under a minute. VTA Farm generates
            the keys, mints the DIDs, and hands you a tamper-evident identity you fully control — no
            servers to run, no cryptography to learn.
          </p>
        </div>

        {/* Steps grid */}
        <ol
          className="m-0 list-none overflow-hidden rounded-[18px] p-0 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
          style={{ gap: '1px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {STEPS.map((step) => (
            <li
              key={step.num}
              className="group flex flex-col gap-4 p-9 transition-colors duration-200"
              style={{ background: 'var(--vtafarm-bg-dark)' }}
              onMouseOver={e => ((e.currentTarget as HTMLElement).style.background = '#1a1a1a')}
              onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = 'var(--vtafarm-bg-dark)')}
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">{step.num}</span>
              <div
                className="relative h-24 overflow-hidden rounded-[12px]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {step.svg}
              </div>
              <h3 className="m-0 font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em]">
                {step.title}
              </h3>
              <p className="m-0 text-[14.5px] leading-[1.55] text-white/66">{step.desc}</p>
              <span className="mt-auto font-mono text-[11px] uppercase tracking-[0.14em] text-white/50 transition-colors duration-200 group-hover:text-white">
                {step.next}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

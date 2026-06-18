function ArtVault() {
  return (
    <div
      className="relative overflow-hidden rounded-[18px]"
      style={{
        background: 'var(--vtafarm-bg-elev)',
        border: '1px solid var(--vtafarm-line)',
        aspectRatio: '4 / 3',
      }}
    >
      <span className="absolute left-[18px] top-4 font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: 'var(--vtafarm-ink-3)' }}>
        Vault · sealed
      </span>
      <div
        className="absolute inset-9 overflow-hidden rounded-[14px]"
        style={{ border: '1px solid var(--vtafarm-line)', background: 'linear-gradient(180deg, var(--vtafarm-bg-elev), color-mix(in srgb, var(--vtafarm-bg-elev) 80%, var(--vtafarm-accent) 8%))' }}
      >
        <div className="flex h-full w-full items-center justify-center">
          {/* Outer dashed spinning ring */}
          <div className="relative grid place-items-center" style={{ width: '64%', aspectRatio: '1', borderRadius: '50%', border: '1.5px solid var(--vtafarm-ink)', position: 'relative' }}>
            <div
              className="absolute animate-spin-slower rounded-full"
              style={{ inset: -14, border: '1px dashed var(--vtafarm-line)' }}
            />
            {/* Inner ring */}
            <div className="absolute rounded-full" style={{ inset: 18, border: '1px solid var(--vtafarm-line)' }} />
            {/* Tick marks overlay */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 0deg,
                  var(--vtafarm-line) 0 1deg, transparent 1deg 30deg,
                  var(--vtafarm-line) 30deg 31deg, transparent 31deg 60deg,
                  var(--vtafarm-line) 60deg 61deg, transparent 61deg 90deg,
                  var(--vtafarm-line) 90deg 91deg, transparent 91deg 120deg,
                  var(--vtafarm-line) 120deg 121deg, transparent 121deg 150deg,
                  var(--vtafarm-line) 150deg 151deg, transparent 151deg 180deg,
                  var(--vtafarm-line) 180deg 181deg, transparent 181deg 210deg,
                  var(--vtafarm-line) 210deg 211deg, transparent 211deg 240deg,
                  var(--vtafarm-line) 240deg 241deg, transparent 241deg 270deg,
                  var(--vtafarm-line) 270deg 271deg, transparent 271deg 300deg,
                  var(--vtafarm-line) 300deg 301deg, transparent 301deg 330deg,
                  var(--vtafarm-line) 330deg 331deg, transparent 331deg 360deg)`,
                WebkitMaskImage: 'radial-gradient(circle, transparent 48%, black 49% 50%, transparent 51%)',
                maskImage: 'radial-gradient(circle, transparent 48%, black 49% 50%, transparent 51%)',
              }}
            />
            {/* Core diamond */}
            <div className="relative rotate-45 rounded-[8px]" style={{ width: '36%', aspectRatio: '1', background: 'var(--vtafarm-ink)' }}>
              <div className="absolute rounded-[4px]" style={{ inset: '18%', background: 'var(--vtafarm-accent)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ArtProof() {
  return (
    <div
      className="relative overflow-hidden rounded-[18px]"
      style={{ background: '#0a0a0a', border: '1px solid var(--vtafarm-line)', aspectRatio: '4 / 3' }}
    >
      <div
        className="flex h-10 items-center gap-2 px-3.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}
      >
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }} />
          ))}
        </div>
        <span className="ml-2">vtafarm · verify --proof age_over_18</span>
      </div>
      <div className="p-4 font-mono text-[12.5px] leading-[1.7]" style={{ color: '#e8e8e8' }}>
        {[
          { n: '01', content: <><span style={{ color: 'rgba(255,255,255,0.45)' }}>$</span> <span>vtafarm verify ./proof.vp</span></> },
          { n: '02', content: <span style={{ color: 'rgba(255,255,255,0.45)' }}>→ resolving did:webvh:QmNU7Zc…SVTi6</span> },
          { n: '03', content: <><span style={{ color: 'rgba(255,255,255,0.45)' }}>→ checking signature ………</span> <span style={{ color: '#34d399' }}>ok</span></> },
          { n: '04', content: <><span style={{ color: 'rgba(255,255,255,0.45)' }}>→ checking issuer trust …</span> <span style={{ color: '#34d399' }}>ok</span></> },
          { n: '05', content: <><span style={{ color: '#c6b8ff' }}>claim</span> <span>age_over_18 = true</span></> },
          { n: '06', content: <><span style={{ color: '#c6b8ff' }}>disclosed</span> <span>{'{}'}</span></> },
          { n: '07', content: <><span style={{ color: '#34d399' }}>✓ proof valid · 184 ms</span><span className="inline-block h-[14px] w-[7px] translate-y-[2px] animate-blink-cursor" style={{ background: '#c6b8ff' }} /></> },
        ].map(row => (
          <div key={row.n} className="flex gap-2.5">
            <span style={{ color: 'rgba(255,255,255,0.25)', width: 22 }}>{row.n}</span>
            <span>{row.content}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ArtNetwork() {
  return (
    <div
      className="relative overflow-hidden rounded-[18px]"
      style={{ background: 'var(--vtafarm-bg-elev)', border: '1px solid var(--vtafarm-line)', aspectRatio: '4 / 3' }}
    >
      <span className="absolute left-[18px] top-4 font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: 'var(--vtafarm-ink-3)' }}>
        Trust graph · live
      </span>
      <svg viewBox="0 0 320 240" preserveAspectRatio="xMidYMid meet" className="absolute inset-7" style={{ width: 'calc(100% - 56px)', height: 'calc(100% - 56px)', overflow: 'visible' }}>
        <path d="M160 120 L60 50" stroke="var(--vtafarm-line)" strokeWidth="1" fill="none" style={{ animation: 'dash-flow 14s linear infinite', strokeDasharray: '4 6' }} />
        <path d="M160 120 L260 60" stroke="var(--vtafarm-line)" strokeWidth="1" fill="none" />
        <path d="M160 120 L70 200" stroke="var(--vtafarm-line)" strokeWidth="1" fill="none" style={{ animation: 'dash-flow 14s linear infinite', strokeDasharray: '4 6' }} />
        <path d="M160 120 L250 180" stroke="var(--vtafarm-line)" strokeWidth="1" fill="none" />
        <path d="M160 120 L60 130" stroke="var(--vtafarm-line)" strokeWidth="1" fill="none" />
        <path d="M160 120 L260 130" stroke="var(--vtafarm-line)" strokeWidth="1" fill="none" style={{ animation: 'dash-flow 14s linear infinite', strokeDasharray: '4 6', stroke: 'var(--vtafarm-accent)' }} />
        <circle cx="160" cy="120" r="14" fill="var(--vtafarm-ink)" stroke="var(--vtafarm-ink)" strokeWidth="1.2" />
        {[
          [60, 50], [260, 60], [70, 200], [250, 180], [60, 130], [260, 130],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="9" style={{ fill: 'var(--vtafarm-bg-elev)' }} stroke="var(--vtafarm-ink)" strokeWidth="1.2" />
        ))}
        <text fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="0.1em" textAnchor="middle" fill="var(--vtafarm-ink-3)" style={{ textTransform: 'uppercase' }}>
          <tspan x="160" y="148">VTA</tspan>
        </text>
        {[
          [60, 34, 'Co-op'], [260, 44, 'Studio'], [70, 220, 'DAO'],
          [250, 200, 'Bank'], [60, 148, 'App'], [260, 148, 'Gov'],
        ].map(([x, y, label]) => (
          <text key={String(label)} fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="0.1em" textAnchor="middle" fill="var(--vtafarm-ink-3)" style={{ textTransform: 'uppercase' }}>
            <tspan x={Number(x)} y={Number(y)}>{label}</tspan>
          </text>
        ))}
      </svg>
    </div>
  )
}

const BENEFITS = [
  {
    eyebrow: 'Sovereignty',
    title: <>You hold the only key. <em style={{ fontStyle: 'italic', color: 'var(--vtafarm-accent)' }}>Literally.</em></>,
    body: 'Your identity lives in a hardware-sealed agent that answers to you and only you. VTA Farm operates the infrastructure; you operate the trust.',
    bullets: [
      'Keys generated and sealed inside a TEE — no plaintext, ever.',
      'Migrate, fork, or self-host your VTA at any time.',
      'Cryptographic proof-of-custody, not a promise on a marketing page.',
    ],
    art: <ArtVault />,
    flip: false,
  },
  {
    eyebrow: 'Privacy',
    title: <>Prove what's true. <em style={{ fontStyle: 'italic', color: 'var(--vtafarm-accent)' }}>Reveal nothing else.</em></>,
    body: 'Selective disclosure and zero-knowledge proofs let you answer the question without handing over the document. Be a member without being a profile.',
    bullets: [
      'Share a single attribute — "verified human" — and keep the rest.',
      'Range proofs for age, residence, balance, score.',
      'No tracking pixels. No data brokers. No correlation by default.',
    ],
    art: <ArtProof />,
    flip: true,
  },
  {
    eyebrow: 'Portability',
    title: <>One identity. <em style={{ fontStyle: 'italic', color: 'var(--vtafarm-accent)' }}>Every community.</em></>,
    body: 'Your VTA carries your reputation across services. Join a co-op, sign a document, log into an app, join a DAO — same agent, same key, no re-signups.',
    bullets: [
      'Bring credentials from anywhere; present them everywhere.',
      'Switch communities without re-proving who you are.',
      'Federated by design — no platform lock-in, ever.',
    ],
    art: <ArtNetwork />,
    flip: false,
  },
]

export function BenefitsSection() {
  return (
    <section id="benefits">
      <div className="section-wrap">
        {/* Header */}
        <div className="section-pad pb-0 grid items-end gap-10 lg:grid-cols-2 lg:gap-20">
          <div>
            <div className="eyebrow mb-6">
              <span className="dot" />
              Why VTA Farm
            </div>
            <h2
              className="font-serif font-normal leading-[1.04] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(40px, 5.2vw, 72px)', maxWidth: '18ch' }}
            >
              You owned your name, your voice, your work.{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--vtafarm-accent)' }}>Now own your trust.</em>
            </h2>
          </div>
          <p className="text-[19px] leading-[1.55]" style={{ color: 'var(--vtafarm-ink-2)', maxWidth: '56ch' }}>
            For thirty years, identity online has been borrowed — issued by platforms, revoked by
            platforms, sold by platforms. VTA Farm returns the deed.
          </p>
        </div>

        {/* Benefit rows */}
        {BENEFITS.map((b, i) => (
          <div
            key={i}
            className={`grid items-center gap-20 py-[60px] lg:grid-cols-2 ${i < BENEFITS.length - 1 ? '' : ''}`}
            style={{ borderTop: '1px solid var(--vtafarm-line)', borderBottom: i === BENEFITS.length - 1 ? '1px solid var(--vtafarm-line)' : undefined }}
          >
            <div className={b.flip ? 'lg:order-2' : ''}>
              <div className="eyebrow mb-4">
                <span className="dot" />
                {b.eyebrow}
              </div>
              <h3
                className="mb-4 font-serif font-normal leading-[1.04] tracking-[-0.02em]"
                style={{ fontSize: 'clamp(34px, 4vw, 52px)' }}
              >
                {b.title}
              </h3>
              <p className="text-[17px] leading-[1.55]" style={{ color: 'var(--vtafarm-ink-2)', maxWidth: '48ch' }}>
                {b.body}
              </p>
              <ul className="mt-7 flex list-none flex-col gap-2.5 p-0">
                {b.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-baseline gap-3 text-[15px]" style={{ color: 'var(--vtafarm-ink-2)' }}>
                    <span className="mt-[1px] h-[5px] w-[5px] flex-none translate-y-[1px] rounded-full" style={{ background: 'var(--vtafarm-accent)' }} />
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
            <div className={b.flip ? 'lg:order-1' : ''}>
              {b.art}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

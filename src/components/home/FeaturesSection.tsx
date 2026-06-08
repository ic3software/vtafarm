const FEATURES = [
  {
    tag: 'TEE · BIP-32',
    title: 'Sealed key custody.',
    desc: "Your private keys never leave a hardware enclave. Not even Cipher can read them. Attestation receipts prove it on every operation.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" strokeLinejoin="round" />
        <path d="M9 12l2.2 2.2L15 10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    tag: 'W3C DID · did:webvh',
    title: 'Decentralized identifiers.',
    desc: 'W3C-compliant DIDs you own outright. Portable across services, resolvable anywhere, revocable on your terms — not a vendor\'s.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M7 10h6M7 14h10" strokeLinecap="round" />
        <circle cx="17.5" cy="10" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    tag: 'VC 2.0 · Selective disclosure',
    title: 'Verifiable credentials.',
    desc: 'Issue and hold cryptographically signed claims. Memberships, certifications, attestations — verifiable in milliseconds, anywhere.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <path d="M5 7l7-4 7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z" strokeLinejoin="round" />
        <path d="M12 8v8M8 12h8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    tag: 'DIDComm v2 · E2EE',
    title: 'DIDComm transport.',
    desc: 'End-to-end encrypted messaging between agents. Negotiate trust, exchange credentials, run protocols — all off the public wire.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
      </svg>
    ),
  },
  {
    tag: 'ACL · Policy as code',
    title: 'Policy engine.',
    desc: "Declarative access rules over your agent's keys and credentials. Gate operations on attestations, time, quorum, or anything in between.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M8 14h2M12 14h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    tag: 'Append-only · Merkle-anchored',
    title: 'Tamper-evident audit.',
    desc: 'Every operation is signed, sequenced, and hash-chained. Export the log, verify locally, sleep at night.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <path d="M4 5h16M4 12h16M4 19h10" strokeLinecap="round" />
        <circle cx="19" cy="19" r="2" />
      </svg>
    ),
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="section-pad">
      <div className="section-wrap">
        {/* Header */}
        <div className="mb-16 grid items-end gap-10 lg:grid-cols-2 lg:gap-20">
          <div>
            <div className="eyebrow mb-6">
              <span className="dot" />
              Features
            </div>
            <h2
              className="font-serif font-normal leading-[1.04] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(40px, 5.2vw, 72px)', maxWidth: '18ch' }}
            >
              A complete{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--cipher-accent)' }}>trust</em> stack,
              distilled.
            </h2>
          </div>
          <p className="text-[19px] leading-[1.55]" style={{ color: 'var(--cipher-ink-2)', maxWidth: '56ch' }}>
            Every primitive you need to build on verifiable identity — keys, credentials, policies,
            audit — in one quietly powerful platform. Use what you need, ignore the rest.
          </p>
        </div>

        {/* Grid */}
        <div
          className="overflow-hidden rounded-[18px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          style={{ gap: '1px', background: 'var(--cipher-line)', border: '1px solid var(--cipher-line)' }}
        >
          {FEATURES.map((feat) => (
            <div
              key={feat.title}
              className="group flex min-h-[280px] flex-col gap-3.5 p-8 transition-colors duration-200"
              style={{ background: 'var(--cipher-bg-elev)' }}
              onMouseOver={e => ((e.currentTarget as HTMLElement).style.background = '#fdfcf9')}
              onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = 'var(--cipher-bg-elev)')}
            >
              <div
                className="mb-1 grid h-10 w-10 place-items-center rounded-[10px] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105"
                style={{ background: 'var(--cipher-accent-soft)', color: 'var(--cipher-accent)' }}
              >
                {feat.icon}
              </div>
              <h3 className="m-0 font-serif text-[28px] font-normal leading-[1.15] tracking-[-0.01em]">
                {feat.title}
              </h3>
              <p className="m-0 text-[15px] leading-[1.55]" style={{ color: 'var(--cipher-ink-2)' }}>
                {feat.desc}
              </p>
              <span className="mt-auto font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: 'var(--cipher-ink-3)' }}>
                {feat.tag}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'

const APPS = [
  { label: 'Homepage', src: '/' },
  { label: 'Portal', src: '/portal' },
  { label: 'Admin', src: '/admin' },
]

const SIZES = [
  { label: 'iPhone 390', w: 390, h: 844 },
  { label: 'Android 360', w: 360, h: 800 },
  { label: 'Max 414', w: 414, h: 896 },
]

function BrandMark() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 22,
        height: 22,
        borderRadius: 6,
        background: '#16150f',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 5,
          borderRadius: 2,
          background: '#6b4eff',
          transform: 'rotate(45deg)',
        }}
      />
    </span>
  )
}

export function MobilePreview() {
  const [appIdx, setAppIdx] = useState(0)
  const [sizeIdx, setSizeIdx] = useState(0)
  const phoneRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const app = APPS[appIdx]
  const size = SIZES[sizeIdx]

  function applySize(w: number, h: number) {
    if (!phoneRef.current || !screenRef.current) return
    const maxH = window.innerHeight - 220
    const scale = Math.min(1, maxH / h)
    screenRef.current.style.width = w + 'px'
    screenRef.current.style.height = h + 'px'
    phoneRef.current.style.transform = `scale(${scale.toFixed(3)})`
  }

  useEffect(() => {
    applySize(size.w, size.h)
  }, [size.w, size.h])

  useEffect(() => {
    const onResize = () => applySize(size.w, size.h)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [size.w, size.h])

  const segBase: React.CSSProperties = {
    fontFamily: "'IBM Plex Sans', sans-serif",
    fontSize: 13,
    fontWeight: 500,
    border: 'none',
    background: 'transparent',
    color: '#6e6c66',
    padding: '7px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background .15s, color .15s, box-shadow .15s',
  }
  const segActive: React.CSSProperties = {
    background: '#fff',
    color: '#16150f',
    boxShadow: '0 1px 2px rgba(0,0,0,.08)',
  }
  const segSmallBase: React.CSSProperties = { ...segBase, padding: '6px 11px', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        background: 'radial-gradient(120% 80% at 50% -10%, #f5f3ee 0%, #e7e4dc 55%, #ddd9cf 100%)',
        color: '#16150f',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          padding: '14px 20px',
          borderBottom: '1px solid #d9d6cc',
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        {/* Brand */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontWeight: 600, fontSize: 15 }}>
          <BrandMark />
          VTA Farm
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: '#6b4eff',
              background: '#ece8ff',
              border: '1px solid #d9d0ff',
              padding: '2px 7px',
              borderRadius: 999,
            }}
          >
            Mobile preview
          </span>
        </span>

        {/* App segmented control */}
        <div style={{ display: 'inline-flex', gap: 3, padding: 3, background: '#e3e0d6', borderRadius: 11 }}>
          {APPS.map((a, i) => (
            <button
              key={a.label}
              style={i === appIdx ? { ...segBase, ...segActive } : segBase}
              onClick={() => {
                setAppIdx(i)
                if (iframeRef.current) iframeRef.current.src = a.src
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Device label */}
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: '#6e6c66',
          }}
        >
          Device
        </span>

        {/* Size segmented control */}
        <div style={{ display: 'inline-flex', gap: 3, padding: 3, background: '#e3e0d6', borderRadius: 11 }}>
          {SIZES.map((s, i) => (
            <button
              key={s.label}
              style={i === sizeIdx ? { ...segSmallBase, ...segActive } : segSmallBase}
              onClick={() => setSizeIdx(i)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Hint + open link */}
        <span style={{ fontSize: 12.5, color: '#6e6c66' }}>
          Live, interactive — scroll &amp; tap inside.{' '}
          <span
            style={{ color: '#6b4eff', fontWeight: 500, cursor: 'pointer' }}
            onClick={() => window.open(app.src, '_blank')}
            onMouseOver={e => ((e.currentTarget as HTMLElement).style.textDecoration = 'underline')}
            onMouseOut={e => ((e.currentTarget as HTMLElement).style.textDecoration = 'none')}
          >
            Open full screen ↗
          </span>
        </span>
      </div>

      {/* Stage */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          padding: '36px 20px 48px',
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          {/* Phone bezel */}
          <div className="phone-bezel" ref={phoneRef}>
            {/* Notch */}
            <div
              style={{
                position: 'absolute',
                top: 11 + 13,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 112,
                height: 32,
                background: '#000',
                borderRadius: 999,
                zIndex: 5,
                pointerEvents: 'none',
              }}
            >
              {/* Camera dot */}
              <div
                style={{
                  position: 'absolute',
                  right: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 30%, #2a2a45, #050505 70%)',
                  boxShadow: '0 0 0 1px rgba(255,255,255,.04)',
                }}
              />
            </div>

            {/* Screen */}
            <div
              ref={screenRef}
              style={{
                position: 'relative',
                width: size.w,
                height: size.h,
                borderRadius: 44,
                overflow: 'hidden',
                background: '#f7f5f0',
              }}
            >
              <iframe
                ref={iframeRef}
                src={app.src}
                title="Mobile preview"
                style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#f7f5f0' }}
              />
            </div>
          </div>

          {/* Meta label */}
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              color: '#6e6c66',
              letterSpacing: '.04em',
            }}
          >
            {app.label} · {size.w} × {size.h}
          </div>
        </div>
      </div>
    </div>
  )
}

import type { Phase } from './portalUtils'

export function PhaseStepper({ phases, currentIndex, failed, spinning: spinningEnabled = true }: { phases: Phase[]; currentIndex: number; failed?: boolean; spinning?: boolean }) {
  const lastIdx = phases.length - 1
  return (
    <div className="p-card" style={{ marginBottom: 20 }}>
      <div className="card-content" style={{ padding: '26px 28px 22px' }}>
        <div className="stepper">
          {phases.map((phase, i) => {
            const state = failed
              ? (i === lastIdx ? 'failed' : 'done')
              : (i < currentIndex ? 'done' : i === currentIndex ? (i === lastIdx ? 'done' : 'active') : '')
            const spinning = state === 'active' && spinningEnabled
            return (
              <div key={phase.key} className={`step ${state}`}>
                <div className="bar" />
                <div className="node">
                  {state === 'done' ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6 9 17l-5-5"/></svg>
                  ) : state === 'failed' ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12"/></svg>
                  ) : spinning ? (
                    <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  ) : i + 1}
                </div>
                <div className="s-label">{phase.label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

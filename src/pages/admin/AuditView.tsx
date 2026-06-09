export function AuditView() {
  return (
    <section className="p-content">
      <div className="page-head">
        <div><h1>Audit log</h1><p className="sub">Every administrative action, signed and hash-chained.</p></div>
      </div>
      <div className="p-alert" style={{ background: 'hsl(var(--muted)/.4)' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: 'hsl(var(--muted-foreground))' }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        <p className="alert-desc">Audit log export is not yet implemented on the backend. Actions will appear here once the audit endpoint is available.</p>
      </div>
    </section>
  )
}

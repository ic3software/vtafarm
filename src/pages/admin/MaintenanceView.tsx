import { MaintenanceCard } from './MaintenanceCard'

export function MaintenanceView() {
  return (
    <section className="p-content">
      <div className="page-head">
        <div>
          <h1>Maintenance mode</h1>
          <p className="sub">Control user workflow access during platform maintenance.</p>
        </div>
      </div>

      <MaintenanceCard />
    </section>
  )
}

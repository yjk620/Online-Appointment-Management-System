import { useEffect, useState } from 'react'
import { filterAppointments, statusTag, whenLabel } from './dashboard'

type Appointment = { id: number; status: string; starts_at: string; ends_at: string; client_name: string; provider_name: string }
const statuses = [['scheduled', 'Scheduled'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['no-show', 'No-show']]
const pageSize = 10

// Totals stay visible; the list behind them is collapsed until asked for, or opened by clicking a total.
export default function AdminAppointments({ refreshVersion }: { refreshVersion: number }) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState('')
  const [status, setStatus] = useState('')
  const [shown, setShown] = useState(pageSize)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setError('')
      try {
        const response = await fetch('/api/admin/appointments', { cache: 'no-store', signal: controller.signal })
        if (response.status === 401) { window.location.replace('/login'); return }
        if (!response.ok) throw new Error('Could not load appointments. Please retry.')
        const result = (await response.json()) as { appointments: Appointment[] }
        if (!controller.signal.aborted) setAppointments(result.appointments)
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load appointments.')
      }
    }
    void load()
    return () => controller.abort()
  }, [refreshVersion, retry])
  useEffect(() => setShown(pageSize), [day, status])

  function showStatus(value: string) {
    setStatus(value); setDay(''); setOpen(true)
    requestAnimationFrame(() => document.getElementById('all-appointments-title')?.scrollIntoView({ block: 'nearest' }))
  }

  if (error) return <section aria-labelledby="appointment-totals-title">
    <h2 id="appointment-totals-title">Appointments</h2>
    <p role="alert">{error}</p><button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>Retry</button>
  </section>
  if (!appointments) return <section aria-labelledby="appointment-totals-title">
    <h2 id="appointment-totals-title">Appointments</h2><p role="status">Loading appointments...</p>
  </section>

  const count = (value: string) => appointments.filter(item => item.status === value).length
  const visible = filterAppointments(appointments, 'all', day, status).reverse()
  return <>
    <section aria-labelledby="appointment-totals-title">
      <h2 id="appointment-totals-title">Appointments ({appointments.length})</h2>
      <p className="status-counts">{statuses.map(([value, label], index) => <span key={value}>
        {index > 0 && ' · '}
        <button type="button" className="link" onClick={() => showStatus(value)} aria-label={`Show ${count(value)} ${label.toLowerCase()}`}>
          {value === 'no-show' && count(value) > 0 ? <span className="tag red">{count(value)} no-show</span> : `${count(value)} ${label.toLowerCase()}`}
        </button>
      </span>)}</p>
    </section>
    <section aria-labelledby="all-appointments-title">
      <h2 id="all-appointments-title"><button className="section-toggle" type="button" aria-expanded={open} aria-controls="all-appointments-content" onClick={() => setOpen(!open)}>
        <span>All appointments ({appointments.length})</span>
      </button></h2>
      <div id="all-appointments-content" hidden={!open}>
        <div className="filter-row">
          <p><label htmlFor="admin-appointment-date">Date</label><input id="admin-appointment-date" type="date" value={day} onChange={event => setDay(event.target.value)} /></p>
          <p><label htmlFor="admin-appointment-status">Status</label><select id="admin-appointment-status" value={status} onChange={event => setStatus(event.target.value)}>
            <option value="">All statuses</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></p>
          {(day || status) && <button type="button" className="link" onClick={() => { setDay(''); setStatus('') }}>Clear filters</button>}
        </div>
        {visible.length === 0 ? <p role="status">{appointments.length === 0 ? 'No appointments have been booked yet.' : 'No appointments match these filters.'}</p> : <>
          <ul className="appointment-list">{visible.slice(0, shown).map(item => {
            // Scheduled gets a tag here too: unlike the provider's lists, this one mixes every status.
            const tag = statusTag(item) ?? { label: 'Scheduled', tone: 'grey' }
            return <li key={item.id}>
              <h3>{item.client_name}{' '}<span className={`tag ${tag.tone}`}>{tag.label}</span></h3>
              <p className={`appointment-when${item.status === 'cancelled' ? ' cancelled' : ''}`}><time dateTime={item.starts_at}>{whenLabel(item.starts_at, item.ends_at)}</time></p>
              <p className="appointment-meta">With {item.provider_name} · Confirmation #{item.id}</p>
            </li>
          })}</ul>
          {visible.length > shown && <button type="button" className="link" onClick={() => setShown(value => value + pageSize)}>Show more ({visible.length - shown})</button>}
        </>}
      </div>
    </section>
  </>
}

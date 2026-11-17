import { useEffect, useState } from 'react'
import { appointmentDate } from './AppointmentHistory'
import { filterAppointments, localDay, openSlots, upcoming } from './dashboard'
import './ProviderAppointments.css'

type Appointment = { id: number; client_name: string; client_email: string; starts_at: string; ends_at: string; status: string }
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' }
const VIEW_LABELS: Record<string, string> = { upcoming: 'Upcoming', history: 'Past and cancelled', all: 'All appointments' }
const statusLabel = (status: string) => status === 'no-show' ? 'No-show' : status.charAt(0).toUpperCase() + status.slice(1)

export default function ProviderAppointments({ refreshVersion = 0, onChanged }: { refreshVersion?: number; onChanged?: () => void }) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState(true)
  const [view, setView] = useState('upcoming')
  const [day, setDay] = useState('')
  const [status, setStatus] = useState('')
  const [slots, setSlots] = useState<{ starts_at: string; booked: boolean }[]>([])
  const [now, setNow] = useState(Date.now())
  const [pending, setPending] = useState<{ id: number; status: string } | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [response, availability] = await Promise.all([
        fetch('/api/provider/appointments', { cache: 'no-store' }),
        fetch('/api/provider/availability', { cache: 'no-store' }),
      ])
      if (response.status === 401 || availability.status === 401) { window.location.replace('/login'); return }
      if (!response.ok || !availability.ok) throw new Error('Could not load your appointments. Please retry.')
      setAppointments((await response.json() as { appointments: Appointment[] }).appointments)
      setSlots((await availability.json() as { slots: { starts_at: string; booked: boolean }[] }).slots)
      setNow(Date.now())
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not load your appointments.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [refreshVersion])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer) }, [])

  async function saveStatus() {
    if (!pending || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/provider/appointments/${pending.id}/status`, {
        method: 'PATCH', headers, body: JSON.stringify({ status: pending.status }),
      })
      if (response.status === 401) { window.location.replace('/login'); return }
      const result = await response.json() as { error?: string }
      if (!response.ok) { setError(result.error ?? 'Could not update this appointment. Refresh and retry.'); return }
      setNotice(`Appointment #${pending.id} marked ${pending.status === 'completed' ? 'Completed' : 'No-show'}.`)
      setPending(null)
      await load()
      onChanged?.()
    } catch { setError('Could not update this appointment. Please retry.') }
    finally { setBusy(false) }
  }

  const visible = filterAppointments(appointments, view, day, status, now)
  const todayKey = localDay(new Date(now))
  const today = appointments.filter(appointment => appointment.status === 'scheduled' && localDay(appointmentDate(appointment.starts_at)) === todayKey)
  // "Today" is a preset of the All view, so it shows as its own selected segment.
  const isToday = view === 'all' && day === todayKey && status === 'scheduled'
  const showing = isToday ? ["Today's scheduled appointments"] : [
    VIEW_LABELS[view],
    day && new Date(`${day}T00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' }),
    status && statusLabel(status),
  ].filter(Boolean)
  function choose(next: string, keepFilters = false) {
    setView(next)
    if (!keepFilters) { setDay(''); setStatus('') }
    setPending(null)
  }
  return <section className="provider-appointments" aria-labelledby="provider-appointments-title">
    <h2 id="provider-appointments-title"><button className="section-toggle" type="button" aria-expanded={expanded} aria-controls="provider-appointments-content" onClick={() => setExpanded(open => !open)}>
      <span>Your appointments</span><span aria-hidden="true">{expanded ? '−' : '+'}</span>
    </button></h2>
    <div id="provider-appointments-content" hidden={!expanded}>
      <p className="section-help">View your bookings and record outcomes once an appointment starts.</p>
      {!loading && !error &&
        <dl className="summary-grid"><div><dt>Scheduled today</dt><dd>{today.length}</dd></div><div><dt>Upcoming</dt><dd>{upcoming(appointments, now).length}</dd></div><div><dt>Open slots</dt><dd>{openSlots(slots, now).length}</dd></div></dl>}
      <div className="appointment-views" role="group" aria-label="Appointment views">
        <button type="button" aria-pressed={isToday} disabled={busy} onClick={() => { setView('all'); setDay(todayKey); setStatus('scheduled'); setPending(null) }}>Today</button>
        <button type="button" aria-pressed={view === 'upcoming'} disabled={busy} onClick={() => choose('upcoming')}>Upcoming</button>
        <button type="button" aria-pressed={view === 'history'} disabled={busy} onClick={() => choose('history')}>Past &amp; cancelled</button>
        <button type="button" aria-pressed={view === 'all' && !isToday} disabled={busy} onClick={() => choose('all', !isToday)}>All</button>
      </div>
      <div className="dashboard-filters">
        <p><label htmlFor="appointment-date">Appointment date</label><input id="appointment-date" type="date" value={day} disabled={busy} onChange={event => { setDay(event.target.value); setPending(null) }} /></p>
        <p><label htmlFor="appointment-status">Status</label><select id="appointment-status" value={status} disabled={busy} onChange={event => { setStatus(event.target.value); setView('all'); setPending(null) }}><option value="">All statuses</option><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no-show">No-show</option></select></p>
        <button type="button" className="secondary" disabled={loading || busy} onClick={() => void load()}>Refresh</button>
      </div>
      <div className="filter-summary">
        <p role="status">Showing: {showing.join(' · ')}{loading ? '' : ` (${visible.length})`}</p>
        {(day || status) && <button type="button" className="link-button" disabled={busy} onClick={() => choose('all')}>Clear filters</button>}
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {loading ? <p role="status">Loading appointments...</p> : !error && (visible.length === 0 ? <p className="empty-state">No appointments match this view and filters.</p> :
        <ul className="appointment-list">{visible.map(appointment => <li key={appointment.id}>
          <div className="appointment-heading">
            <h3>{appointment.client_name}</h3>
            <span className={appointment.status === 'scheduled' ? 'slot-state' : 'slot-state muted'}>{statusLabel(appointment.status)}</span>
          </div>
          <p><time dateTime={appointment.starts_at}>{appointmentDate(appointment.starts_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time> - {appointmentDate(appointment.ends_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
          <p className="appointment-meta"><a href={`mailto:${appointment.client_email}`}>{appointment.client_email}</a> · Confirmation #{appointment.id}</p>
          {appointment.status === 'scheduled' && appointmentDate(appointment.starts_at).getTime() <= Date.now() &&
            <div className="appointment-actions">
              <button disabled={busy} onClick={() => setPending({ id: appointment.id, status: 'completed' })}>Mark completed</button>
              <button className="secondary" disabled={busy} onClick={() => setPending({ id: appointment.id, status: 'no-show' })}>Mark no-show</button>
            </div>}
          {pending?.id === appointment.id && <div className="appointment-change">
            <p>Mark this appointment {pending.status === 'completed' ? 'Completed' : 'No-show'}? This outcome cannot be changed.</p>
            <div className="appointment-actions"><button disabled={busy} onClick={() => void saveStatus()}>{busy ? 'Saving...' : 'Confirm outcome'}</button>
              <button className="secondary" disabled={busy} onClick={() => setPending(null)}>Keep scheduled</button></div>
          </div>}
        </li>)}</ul>)}
    </div>
  </section>
}

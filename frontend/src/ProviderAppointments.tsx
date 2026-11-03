import { useEffect, useState } from 'react'
import { appointmentDate } from './AppointmentHistory'
import { filterAppointments, localDay, openSlots, upcoming } from './dashboard'
import './ProviderAppointments.css'

type Appointment = { id: number; client_name: string; client_email: string; starts_at: string; ends_at: string; status: string }
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' }

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
  const today = appointments.filter(appointment => appointment.status === 'scheduled' && localDay(appointmentDate(appointment.starts_at)) === localDay(new Date(now)))
  return <section className="provider-appointments" aria-labelledby="provider-appointments-title">
    <h2 id="provider-appointments-title"><button className="section-toggle" aria-expanded={expanded} aria-controls="provider-appointments-content" onClick={() => setExpanded(open => !open)}>Your appointments</button></h2>
    <div id="provider-appointments-content" hidden={!expanded}>
      <p>View your bookings and record outcomes once an appointment starts.</p>
      {!loading && !error && <>
        <h3>Schedule overview</h3>
        <dl className="summary-grid"><div><dt>Scheduled today</dt><dd>{today.length}</dd></div><div><dt>Upcoming appointments</dt><dd>{upcoming(appointments, now).length}</dd></div><div><dt>Open future slots</dt><dd>{openSlots(slots, now).length}</dd></div></dl>
        <button className="secondary" onClick={() => { setView('all'); setDay(localDay(new Date(now))); setStatus('scheduled'); setPending(null) }}>View today&apos;s appointments</button>
      </>}
      <div className="appointment-actions appointment-views" role="group" aria-label="Appointment views">
        <button className={view === 'upcoming' ? '' : 'secondary'} aria-pressed={view === 'upcoming'} disabled={busy} onClick={() => { setView('upcoming'); setDay(''); setStatus(''); setPending(null) }}>Upcoming</button>
        <button className={view === 'history' ? '' : 'secondary'} aria-pressed={view === 'history'} disabled={busy} onClick={() => { setView('history'); setDay(''); setStatus(''); setPending(null) }}>Past and cancelled</button>
        <button className={view === 'all' ? '' : 'secondary'} aria-pressed={view === 'all'} disabled={busy} onClick={() => { setView('all'); setPending(null) }}>All appointments</button>
      </div>
      <div className="dashboard-filters">
        <label htmlFor="appointment-date">Appointment date</label><input id="appointment-date" type="date" value={day} disabled={busy} onChange={event => { setDay(event.target.value); setPending(null) }} />
        <label htmlFor="appointment-status">Appointment status</label><select id="appointment-status" value={status} disabled={busy} onChange={event => { setStatus(event.target.value); setView('all'); setPending(null) }}><option value="">All statuses</option><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no-show">No-show</option></select>
        <button className="secondary" disabled={busy} onClick={() => { setView('all'); setDay(''); setStatus(''); setPending(null) }}>Clear appointment filters</button>
      </div>
      <button className="secondary" disabled={loading || busy} onClick={() => void load()}>Refresh appointments</button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {loading ? <p role="status">Loading appointments...</p> : !error && (visible.length === 0 ? <p>No appointments match this view and filters.</p> :
        <ul className="appointment-list">{visible.map(appointment => <li key={appointment.id}>
          <h3>{appointment.client_name}</h3>
          <p><a href={`mailto:${appointment.client_email}`}>{appointment.client_email}</a></p>
          <p><time dateTime={appointment.starts_at}>{appointmentDate(appointment.starts_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time> - {appointmentDate(appointment.ends_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
          <p>Status: {appointment.status === 'no-show' ? 'No-show' : appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}</p>
          <p>Confirmation #{appointment.id}</p>
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

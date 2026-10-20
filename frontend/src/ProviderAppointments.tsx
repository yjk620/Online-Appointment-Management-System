import { useEffect, useState } from 'react'
import { appointmentDate } from './AppointmentHistory'

type Appointment = { id: number; client_name: string; client_email: string; starts_at: string; ends_at: string; status: string }
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' }

export default function ProviderAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState(true)
  const [history, setHistory] = useState(false)
  const [pending, setPending] = useState<{ id: number; status: string } | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/provider/appointments', { cache: 'no-store' })
      if (response.status === 401) { window.location.replace('/login'); return }
      if (!response.ok) throw new Error('Could not load your appointments. Please retry.')
      setAppointments((await response.json() as { appointments: Appointment[] }).appointments)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not load your appointments.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

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
    } catch { setError('Could not update this appointment. Please retry.') }
    finally { setBusy(false) }
  }

  const visible = appointments.filter(appointment => history
    ? appointment.status !== 'scheduled' || appointmentDate(appointment.starts_at).getTime() <= Date.now()
    : appointment.status === 'scheduled' && appointmentDate(appointment.starts_at).getTime() > Date.now())
  return <section aria-labelledby="provider-appointments-title">
    <h2 id="provider-appointments-title"><button className="section-toggle" aria-expanded={expanded} aria-controls="provider-appointments-content" onClick={() => setExpanded(open => !open)}>Your appointments</button></h2>
    <div id="provider-appointments-content" hidden={!expanded}>
      <p>View your bookings and record outcomes once an appointment starts.</p>
      <div className="appointment-actions">
        <button className={history ? 'secondary' : ''} aria-pressed={!history} disabled={busy} onClick={() => { setHistory(false); setPending(null) }}>Upcoming</button>
        <button className={history ? '' : 'secondary'} aria-pressed={history} disabled={busy} onClick={() => { setHistory(true); setPending(null) }}>Past and cancelled</button>
      </div>
      <button className="secondary" disabled={loading || busy} onClick={() => void load()}>Refresh appointments</button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {loading ? <p role="status">Loading appointments...</p> : !error && (visible.length === 0 ? <p>{history ? 'No past or cancelled appointments.' : 'No upcoming appointments.'}</p> :
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

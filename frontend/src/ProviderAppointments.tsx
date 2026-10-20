import { useEffect, useState } from 'react'

type Appointment = {
  id: number
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show'
  client_id: number
  client_name: string
  client_email: string
  starts_at: string
  ends_at: string
  can_update_status: boolean
}

const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' }

function localDate(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(' ', 'T') + 'Z')
}

function dateLabel(value: string) {
  return localDate(value).toLocaleDateString(undefined, { dateStyle: 'full' })
}

function timeLabel(value: string) {
  return localDate(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function statusLabel(value: Appointment['status']) {
  return value === 'no-show' ? 'No-show' : value[0].toUpperCase() + value.slice(1)
}

export default function ProviderAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [expanded, setExpanded] = useState(true)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/provider/appointments', { cache: 'no-store' })
      if (response.status === 401) { window.location.replace('/login'); return }
      if (!response.ok) throw new Error('Could not load your appointments. Please retry.')
      setAppointments(((await response.json()) as { appointments: Appointment[] }).appointments)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load your appointments.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  async function updateStatus(appointment: Appointment, status: 'completed' | 'no-show') {
    if (busy !== null) return
    setBusy(appointment.id)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/provider/appointments/${appointment.id}/status`, {
        method: 'POST', headers, body: JSON.stringify({ status }),
      })
      if (response.status === 401) { window.location.replace('/login'); return }
      const result = (await response.json()) as { error?: string }
      if (!response.ok) { setError(result.error ?? 'Could not update this appointment.'); return }
      setMessage(`Appointment #${appointment.id} marked ${statusLabel(status)}.`)
      await load()
    } catch { setError('Could not update this appointment. Please try again.') }
    finally { setBusy(null) }
  }

  const upcoming = appointments.filter(item => item.status === 'scheduled' && localDate(item.starts_at) > new Date())
  const history = appointments.filter(item => !upcoming.includes(item))

  function cards(items: Appointment[]) {
    return <ul className="appointment-list">{items.map(appointment => <li key={appointment.id}>
      <h4>{appointment.client_name}</h4>
      <p>{appointment.client_email}</p>
      <p><time dateTime={appointment.starts_at}>{dateLabel(appointment.starts_at)}</time></p>
      <p>{timeLabel(appointment.starts_at)} - {timeLabel(appointment.ends_at)}</p>
      <p>Status: <strong>{statusLabel(appointment.status)}</strong></p>
      <p>Appointment #{appointment.id}</p>
      {appointment.can_update_status && <div className="appointment-actions">
        <button type="button" disabled={busy !== null} onClick={() => void updateStatus(appointment, 'completed')}>Mark completed</button>
        <button className="secondary" type="button" disabled={busy !== null} onClick={() => void updateStatus(appointment, 'no-show')}>Mark no-show</button>
      </div>}
    </li>)}</ul>
  }

  return <section aria-labelledby="provider-appointments-title">
    <h2 id="provider-appointments-title"><button className="section-toggle" type="button" aria-expanded={expanded} aria-controls="provider-appointments-content" onClick={() => setExpanded(open => !open)}>
      <span>Appointments{!loading ? ` (${appointments.length})` : ''}</span><span aria-hidden="true">{expanded ? '-' : '+'}</span>
    </button></h2>
    <div id="provider-appointments-content" hidden={!expanded}>
      <p>View client appointments and record completed or missed visits after their start time.</p>
      {error && <p role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      <button className="secondary" type="button" disabled={loading || busy !== null} onClick={() => void load()}>Refresh appointments</button>
      {loading ? <p role="status">Loading your appointments...</p> : <>
        <h3>Upcoming</h3>
        {upcoming.length ? cards(upcoming) : <p>You have no upcoming appointments.</p>}
        <h3>History and updates</h3>
        {history.length ? cards(history) : <p>No completed, cancelled, or missed appointments yet.</p>}
      </>}
    </div>
  </section>
}

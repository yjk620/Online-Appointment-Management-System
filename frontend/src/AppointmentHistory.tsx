import { useEffect, useState } from 'react'
import { whenLabel } from './dashboard'

type Appointment = { id: number; provider_name: string; starts_at: string; ends_at: string; status: string }

export function appointmentDate(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(' ', 'T') + 'Z')
}

export default function AppointmentHistory({ refreshVersion }: { refreshVersion: number }) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/appointments/history', { cache: 'no-store' })
      if (response.status === 401) { window.location.replace('/login'); return }
      if (!response.ok) throw new Error('Could not load appointment history. Please retry.')
      setAppointments((await response.json() as { appointments: Appointment[] }).appointments)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not load appointment history.') }
    finally { setLoading(false) }
  }
  useEffect(() => { if (expanded) void load() }, [expanded, refreshVersion])
  return <section aria-labelledby="history-title">
    <h2 id="history-title"><button className="section-toggle" aria-expanded={expanded} aria-controls="history-content" onClick={() => setExpanded(open => !open)}>
      <span>Appointment history</span>
    </button></h2>
    <div id="history-content" hidden={!expanded}>
      <p>All your appointments, including cancelled bookings and recorded outcomes.</p>
      {error && <><p role="alert">{error}</p><button className="secondary" disabled={loading} onClick={() => void load()}>Retry history</button></>}
      {loading ? <p role="status">Loading history...</p> : !error && (appointments.length === 0 ? <p>No appointments recorded yet.</p> :
        <ul className="appointment-list">{appointments.map(appointment => <li key={appointment.id}>
          <h3>{appointment.provider_name}</h3>
          <p className="appointment-when"><time dateTime={appointment.starts_at}>{whenLabel(appointment.starts_at, appointment.ends_at)}</time></p>
          {/* shortcut: no year shown, fine within a term; add it if history spans years */}
          <p className="appointment-meta">{appointment.status === 'no-show' ? 'No-show' : appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)} · Confirmation #{appointment.id}</p>
        </li>)}</ul>)}
    </div>
  </section>
}

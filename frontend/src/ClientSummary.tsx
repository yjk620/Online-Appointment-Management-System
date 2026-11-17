import { useEffect, useState } from 'react'
import { dateValue, timeZoneNote, upcoming } from './dashboard'
import './ClientSummary.css'

type Appointment = { id: number; provider_name: string; starts_at: string; status: string }

export default function ClientSummary({ refreshVersion, onBook, onHistory, onRefresh }: { refreshVersion: number; onBook: () => void; onHistory: () => void; onRefresh: () => void }) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer) }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    async function load() {
      try {
        const response = await fetch('/api/appointments', { cache: 'no-store', signal: controller.signal })
        if (response.status === 401) { window.location.replace('/login'); return }
        if (!response.ok) throw new Error('Could not load your overview. Please retry.')
        const result = await response.json() as { appointments: Appointment[] }
        if (!controller.signal.aborted) { setAppointments(result.appointments); setNow(Date.now()) }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load your overview.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load(); return () => controller.abort()
  }, [refreshVersion])
  const next = upcoming(appointments, now)
  return <section className="client-summary" aria-labelledby="client-overview-title">
    <h2 id="client-overview-title">Next appointment</h2>
    {loading ? <p role="status">Loading overview...</p> : error ? <p role="alert">{error}</p> : next[0] ? <>
      <p className="next-provider">{next[0].provider_name}</p>
      <p className="next-time"><time dateTime={next[0].starts_at}>{dateValue(next[0].starts_at).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}</time></p>
      <p className="time-zone-note">{timeZoneNote()}</p>
      {next.length > 1 && <p className="next-count">Plus {next.length - 1} more upcoming</p>}
    </> : <p>No upcoming appointments. Book a time when you are ready.</p>}
    <div className="appointment-actions"><button onClick={onBook}>Book an appointment</button><button className="secondary" onClick={onHistory}>View history</button></div>
    <button type="button" className="link-button" disabled={loading} onClick={onRefresh}>{error ? 'Retry overview' : 'Refresh overview'}</button>
  </section>
}

import { useEffect, useState } from 'react'
import { dateValue, upcoming } from './dashboard'

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
  return <section aria-labelledby="client-overview-title">
    <h2 id="client-overview-title">Your overview</h2>
    {loading ? <p role="status">Loading overview...</p> : error ? <p role="alert">{error}</p> : <>
      <p><strong>{next.length}</strong> upcoming appointment{next.length === 1 ? '' : 's'}</p>
      {next[0] ? <p>Next: <strong>{next[0].provider_name}</strong><br /><time dateTime={next[0].starts_at}>{dateValue(next[0].starts_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></p> : <p>No upcoming appointments. Book a time when you are ready.</p>}
    </>}
    <div className="appointment-actions"><button onClick={onBook}>Book an appointment</button><button className="secondary" onClick={onHistory}>View appointment history</button></div>
    <button className="secondary" disabled={loading} onClick={onRefresh}>{error ? 'Retry overview' : 'Refresh overview'}</button>
  </section>
}

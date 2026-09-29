import { useEffect, useState } from 'react'

type Appointment = { id: number; provider_name: string; starts_at: string; ends_at: string; status: string }
function localDate(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(' ', 'T') + 'Z')
}

export default function UpcomingAppointments({ refreshVersion }: { refreshVersion: number }) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/appointments', { cache: 'no-store', signal: controller.signal })
        if (response.status === 401) { window.location.replace('/login'); return }
        if (!response.ok) throw new Error(response.status === 403 ? 'Client access is required to view appointments.' : 'Could not load your appointments. Please retry.')
        const result = (await response.json()) as { appointments: Appointment[] }
        if (!controller.signal.aborted) setAppointments(result.appointments)
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load appointments.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [refreshVersion, retry])
  return <section aria-labelledby="upcoming-title">
    <h2 id="upcoming-title">Upcoming appointments</h2>
    <p>Times are shown in your device's local time zone.</p>
    {loading ? <p role="status">Loading your appointments...</p> : error ? <p role="alert">{error}</p> : appointments.length === 0 ? <p>You have no upcoming appointments. Choose a provider below to book one.</p> :
      <ul className="appointment-list">{appointments.map(item => <li key={item.id}>
        <h3>{item.provider_name}</h3>
        <p><time dateTime={item.starts_at}>{localDate(item.starts_at).toLocaleDateString(undefined, { dateStyle: 'full' })}</time></p>
        <p>{localDate(item.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })} - {localDate(item.ends_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</p>
        <p>Status: {item.status}</p><p>Confirmation #{item.id}</p>
      </li>)}</ul>}
    <button disabled={loading} onClick={() => setRetry(value => value + 1)}>{error ? 'Retry appointments' : 'Refresh appointments'}</button>
  </section>
}

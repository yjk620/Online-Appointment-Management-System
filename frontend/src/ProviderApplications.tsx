import { useEffect, useState } from 'react'
import { dateValue, dayLabel } from './dashboard'

type Application = { id: number; name: string; email: string; requested_at: string }
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' }

// "Mon, Nov 16 · 11:36 PM", matching the dates on the other pages.
function appliedLabel(value: string) {
  return `${dayLabel(value)} · ${dateValue(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

export default function ProviderApplications({ refreshVersion, onDecided }: { refreshVersion: number; onDecided: () => void }) {
  const [applications, setApplications] = useState<Application[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [rejecting, setRejecting] = useState<number | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch('/api/admin/provider-applications', { cache: 'no-store', signal: controller.signal })
        if (response.status === 401) { window.location.replace('/login'); return }
        if (!response.ok) throw new Error('Could not load provider applications. Please retry.')
        const result = (await response.json()) as { applications: Application[] }
        if (!controller.signal.aborted) setApplications(result.applications)
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load provider applications.')
      }
    }
    void load()
    return () => controller.abort()
  }, [refreshVersion])

  async function decide(application: Application, decision: 'approve' | 'reject') {
    setBusyId(application.id)
    setError('')
    try {
      const response = await fetch(`/api/admin/provider-applications/${application.id}/${decision}`, { method: 'POST', headers, body: '{}' })
      if (response.status === 401) { window.location.replace('/login'); return }
      if (!response.ok) setError(((await response.json()) as { error?: string }).error ?? 'Could not update the application. Please retry.')
    } catch { setError('Could not connect to the server. Please try again.') }
    // Reload the whole page's data (list, totals, users), whether the decision succeeded or not.
    finally { setBusyId(null); setRejecting(null); onDecided() }
  }

  return <section className={applications?.length ? 'needs-review' : undefined} aria-labelledby="applications-title">
    <h2 id="applications-title">Needs your review{applications ? ` (${applications.length})` : ''}</h2>
    {error && <p role="alert">{error}</p>}
    {!applications ? !error && <p role="status">Loading applications...</p>
      : applications.length === 0 ? <p>No applications waiting.</p>
      : <ul className="appointment-list">{applications.map(item => <li key={item.id}>
        <h3>{item.name}</h3>
        <p className="appointment-meta">{item.email} · Applied {appliedLabel(item.requested_at)}</p>
        {rejecting === item.id ? <div className="appointment-change" role="group" aria-label={`Confirm reject ${item.name}`}>
          <p>Reject {item.name}? Their account will be deleted. This can't be undone.</p>
          <div className="appointment-actions">
            <button type="button" className="destructive" disabled={busyId !== null} onClick={() => void decide(item, 'reject')}>{busyId === item.id ? 'Rejecting...' : 'Reject'}</button>
            <button type="button" className="secondary" disabled={busyId !== null} onClick={() => setRejecting(null)}>Keep</button>
          </div>
        </div> : <div className="application-actions">
          <button type="button" disabled={busyId !== null} onClick={() => void decide(item, 'approve')}>{busyId === item.id ? 'Approving...' : 'Approve'}</button>
          <button type="button" className="link" disabled={busyId !== null} onClick={() => setRejecting(item.id)}>Reject</button>
        </div>}
      </li>)}</ul>}
  </section>
}

import { useEffect, useState } from 'react'
import './ProviderApplications.css'

type Application = { id: number; name: string; email: string; requested_at: string }
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' }

export default function ProviderApplications() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      try {
        const response = await fetch('/api/admin/provider-applications', { cache: 'no-store', signal: controller.signal })
        if (response.status === 401) { window.location.replace('/login'); return }
        if (!response.ok) throw new Error('Could not load provider applications. Please retry.')
        const result = (await response.json()) as { applications: Application[] }
        if (!controller.signal.aborted) setApplications(result.applications)
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load provider applications.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [reload])
  async function decide(application: Application, decision: 'approve' | 'reject') {
    if (decision === 'reject' && !window.confirm(`Reject ${application.name}? Their pending account will be deleted.`)) return
    setBusyId(application.id)
    setError('')
    try {
      const response = await fetch(`/api/admin/provider-applications/${application.id}/${decision}`, { method: 'POST', headers, body: '{}' })
      if (response.status === 401) { window.location.replace('/login'); return }
      if (!response.ok) setError(((await response.json()) as { error?: string }).error ?? 'Could not update the application. Please retry.')
    } catch { setError('Could not connect to the server. Please try again.') }
    finally { setBusyId(null); setReload(value => value + 1) }
  }
  return <section className="provider-applications" aria-labelledby="applications-title">
    <h2 id="applications-title">Provider applications{loading ? '' : ` (${applications.length})`}</h2>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Loading applications...</p> : applications.length === 0 ? <p>No provider applications are waiting for review.</p> :
      <ul className="application-list">{applications.map(item => <li key={item.id}>
        <h3>{item.name}</h3>
        <p>{item.email}</p>
        <p>Applied {new Date(item.requested_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
        <div className="application-actions">
          <button type="button" disabled={busyId !== null} onClick={() => void decide(item, 'approve')}>Approve</button>
          <button type="button" className="reject" disabled={busyId !== null} onClick={() => void decide(item, 'reject')}>Reject</button>
        </div>
      </li>)}</ul>}
    <button disabled={loading || busyId !== null} onClick={() => { setError(''); setReload(value => value + 1) }}>Refresh applications</button>
  </section>
}

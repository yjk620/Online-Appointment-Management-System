import { useEffect, useState } from 'react'

type Summary = {
  accounts: { clients: number; approved_providers: number; pending_applications: number }
  appointments: { scheduled: number; completed: number; cancelled: number; 'no-show': number }
}

const accountLabels: [keyof Summary['accounts'], string][] = [
  ['clients', 'Clients'], ['approved_providers', 'Approved providers'], ['pending_applications', 'Pending applications'],
]
const statusLabels: [keyof Summary['appointments'], string][] = [
  ['scheduled', 'Scheduled'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['no-show', 'No-show'],
]

export default function AdminSummary({ refreshVersion }: { refreshVersion: number }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setError('')
      try {
        const response = await fetch('/api/admin/summary', { cache: 'no-store', signal: controller.signal })
        if (response.status === 401) { window.location.replace('/login'); return }
        if (!response.ok) throw new Error('Could not load the summary. Please retry.')
        const result = (await response.json()) as Summary
        if (!controller.signal.aborted) setSummary(result)
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load the summary.')
      }
    }
    void load()
    return () => controller.abort()
  }, [refreshVersion, retry])

  return <section className="admin-summary" aria-labelledby="summary-title">
    <h2 id="summary-title">Overview</h2>
    {error ? <><p role="alert">{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry summary</button></>
      : !summary ? <p role="status">Loading summary...</p> : <>
        <h3>Accounts</h3>
        <dl className="summary-grid">{accountLabels.map(([key, label]) =>
          <div key={key}><dt>{label}</dt><dd>{summary.accounts[key]}</dd></div>)}</dl>
        <h3>Appointments</h3>
        <dl className="summary-grid">{statusLabels.map(([key, label]) =>
          <div key={key}><dt>{label}</dt><dd>{summary.appointments[key]}</dd></div>)}</dl>
      </>}
  </section>
}

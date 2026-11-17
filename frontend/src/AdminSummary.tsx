import { useEffect, useState } from 'react'
import ProviderApplications from './ProviderApplications'
import AdminUsers from './AdminUsers'
import AdminAppointments from './AdminAppointments'
import { timeZoneLabel } from './dashboard'

type Summary = {
  accounts: { clients: number; approved_providers: number; pending_applications: number }
  appointments: { scheduled: number; completed: number; cancelled: number; 'no-show': number }
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

// Admin home: the summary line, then review and appointments on the left, users on the right.
export default function AdminSummary({ refreshVersion }: { refreshVersion: number }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [decisions, setDecisions] = useState(0)
  const version = refreshVersion + decisions
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setError('')
      try {
        const response = await fetch('/api/admin/summary', { cache: 'no-store', signal: controller.signal })
        if (response.status === 401) { window.location.replace('/login'); return }
        if (!response.ok) throw new Error('Could not load the totals. Please retry.')
        const result = (await response.json()) as Summary
        if (!controller.signal.aborted) setSummary(result)
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load the totals.')
      }
    }
    void load()
    return () => controller.abort()
  }, [version])

  const accounts = summary?.accounts
  return <>
    {error && <><p role="alert">{error}</p><button type="button" className="secondary" onClick={() => setDecisions(value => value + 1)}>Retry</button></>}
    <p className="home-summary">
      Times shown in {timeZoneLabel()}
      {accounts && <> · {plural(accounts.clients, 'client')} · {plural(accounts.approved_providers, 'provider')}{accounts.pending_applications > 0 && <> · {accounts.pending_applications} pending</>}</>}
    </p>
    <div className="home-grid">
      <ProviderApplications refreshVersion={version} onDecided={() => setDecisions(value => value + 1)} />
      <AdminAppointments refreshVersion={version} />
      <AdminUsers refreshVersion={version} />
    </div>
  </>
}

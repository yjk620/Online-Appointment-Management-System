import { useEffect, useState } from 'react'
import './Providers.css'

type Provider = { id: number; name: string; description: string }
type Slot = { id: number; provider_id: number; starts_at: string }

function slotDate(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(' ', 'T') + 'Z')
}

export default function Providers({ refreshVersion }: { refreshVersion: number }) {
  const [expanded, setExpanded] = useState(false)
  const [providers, setProviders] = useState<Provider[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/booking/options', { cache: 'no-store', signal: controller.signal })
        if (response.status === 401) { window.location.replace('/login'); return }
        if (!response.ok) throw new Error('Could not load providers. Please retry.')
        const result = (await response.json()) as { providers: Provider[]; slots: Slot[] }
        if (!controller.signal.aborted) { setProviders(result.providers); setSlots(result.slots) }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load providers.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [refreshVersion, retry])
  const selected = providers.find(item => item.id === selectedId)
  const openTimes = selected ? slots.filter(item => item.provider_id === selected.id) : []
  return <section aria-labelledby="providers-title">
    <h2 id="providers-title"><button className="section-toggle" type="button" aria-expanded={expanded} aria-controls="providers-content" onClick={() => setExpanded(open => !open)}>
      <span>Providers{!loading && !error ? ` (${providers.length})` : ''}</span><span aria-hidden="true">{expanded ? '-' : '+'}</span>
    </button></h2>
    <div id="providers-content" hidden={!expanded}>
    {loading ? <p role="status">Loading providers...</p> : error ? <p role="alert">{error}</p> : providers.length === 0 ? <p>No providers are available yet.</p> : selected ?
      <div className="provider-details" aria-labelledby="provider-name">
        <h3 id="provider-name">{selected.name}</h3>
        <p>{selected.description || 'This provider has not added a description yet.'}</p>
        <p>{openTimes.length === 0 ? 'No open appointment times right now.'
          : `${openTimes.length} open appointment time${openTimes.length === 1 ? '' : 's'}. Next: ${slotDate(openTimes[0].starts_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`}</p>
        <p>To book, open Book an appointment below and choose {selected.name}.</p>
        <button type="button" onClick={() => setSelectedId(null)}>Back to all providers</button>
      </div> :
      <ul className="provider-list">{providers.map(item => <li key={item.id}>
        <button type="button" onClick={() => setSelectedId(item.id)}>
          <strong>{item.name}</strong>{item.description && <span>{item.description}</span>}
        </button>
      </li>)}</ul>}
    {!selected && <button disabled={loading} onClick={() => setRetry(value => value + 1)}>{error ? 'Retry providers' : 'Refresh providers'}</button>}
    </div>
  </section>
}

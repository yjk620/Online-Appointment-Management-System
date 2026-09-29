import { FormEvent, useEffect, useState } from 'react'

type Provider = { id: number; name: string; description: string }
type Slot = { id: number; provider_id: number; starts_at: string; ends_at: string }
type Appointment = { id: number; provider_name: string; starts_at: string; ends_at: string; status: string }
function dateLabel(value: string) {
  const zoned = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(' ', 'T') + 'Z'
  return new Date(zoned).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function Booking() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [provider, setProvider] = useState('')
  const [slot, setSlot] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState<Appointment | null>(null)
  async function load() {
    setLoading(true)
    try {
      const response = await fetch('/api/booking/options', { cache: 'no-store' })
      if (response.status === 401) { window.location.replace('/login'); return }
      if (!response.ok) throw new Error('Could not load booking options. Please retry.')
      const result = (await response.json()) as { providers: Provider[]; slots: Slot[] }
      setProviders(result.providers)
      setSlots(result.slots)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not load options.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const available = slots.filter(item => item.provider_id === Number(provider))
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setConfirmed(null)
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' },
        body: JSON.stringify({ availability_id: Number(slot) }),
      })
      if (response.status === 401) { window.location.replace('/login'); return }
      const result = (await response.json()) as { error?: string; appointment: Appointment }
      if (!response.ok) {
        setError(result.error ?? 'Booking failed. Please try again.')
        if (response.status === 409 || response.status === 404) { setSlot(''); await load() }
        return
      }
      setConfirmed(result.appointment)
      setSlots(current => current.filter(item => item.id !== Number(slot)))
      setSlot('')
    } catch { setError('Could not confirm the booking. Refresh available times before retrying.') }
    finally { setBusy(false) }
  }
  return <section aria-labelledby="booking-title">
    <h2 id="booking-title">Book an appointment</h2>
    <p>Times are shown in your device's local time zone.</p>
    {error && <p role="alert">{error}</p>}
    {confirmed && <div role="status"><h3>Appointment booked</h3><p>{confirmed.provider_name}</p><p>{dateLabel(confirmed.starts_at)} - {dateLabel(confirmed.ends_at)}</p><p>Confirmation #{confirmed.id} - {confirmed.status}</p></div>}
    {loading ? <p role="status">Loading available times…</p> : providers.length === 0 ? <p>No providers are available yet.</p> : <form onSubmit={submit}>
      <p><label htmlFor="booking-provider">Provider</label><br />
        <select id="booking-provider" required disabled={busy} value={provider} onChange={event => { setProvider(event.target.value); setSlot('') }}>
          <option value="">Choose a provider</option>{providers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></p>
      {provider && <p>{providers.find(item => item.id === Number(provider))?.description}</p>}
      {provider && available.length === 0 ? <p>No available times for this provider.</p> : <p><label htmlFor="booking-slot">Available time</label><br />
        <select id="booking-slot" required disabled={!provider || busy} value={slot} onChange={event => setSlot(event.target.value)}>
          <option value="">Choose a time</option>{available.map(item => <option key={item.id} value={item.id}>{dateLabel(item.starts_at)} - {dateLabel(item.ends_at)}</option>)}
        </select></p>}
      <button disabled={busy || !available.some(item => item.id === Number(slot))} type="submit">{busy ? 'Booking…' : 'Book appointment'}</button>
    </form>}
    <p><button disabled={busy || loading} onClick={() => { setError(''); setSlot(''); void load() }}>Refresh available times</button></p>
  </section>
}

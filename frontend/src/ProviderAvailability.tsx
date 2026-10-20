import { FormEvent, useEffect, useState } from 'react'

type Slot = { id: number; starts_at: string; ends_at: string; booked: boolean }
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' }

function localDate(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(' ', 'T') + 'Z')
}
function timeLabel(value: string) {
  return localDate(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}
function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function ProviderAvailability() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [added, setAdded] = useState<Slot | null>(null)
  const [expanded, setExpanded] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const response = await fetch('/api/provider/availability', { cache: 'no-store' })
      if (response.status === 401) { window.location.replace('/login'); return }
      if (!response.ok) throw new Error('Could not load your availability. Please retry.')
      setSlots(((await response.json()) as { slots: Slot[] }).slots)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not load your availability.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setAdded(null)
    try {
      // The browser reads the date and time in the provider's local time zone; the API stores UTC.
      const startsAt = new Date(`${date}T${time}`).toISOString()
      const response = await fetch('/api/provider/availability', { method: 'POST', headers, body: JSON.stringify({ starts_at: startsAt }) })
      if (response.status === 401) { window.location.replace('/login'); return }
      const result = (await response.json()) as { error?: string; slot: Slot }
      if (!response.ok) { setError(result.error ?? 'Could not add this time. Please try again.'); return }
      setAdded(result.slot)
      setTime('')
      await load()
    } catch { setError('Could not add this time. Please try again.') }
    finally { setBusy(false) }
  }

  return <section aria-labelledby="availability-title">
    <h2 id="availability-title"><button className="section-toggle" type="button" aria-expanded={expanded} aria-controls="availability-content" onClick={() => setExpanded(open => !open)}>
      <span>Your availability{!loading ? ` (${slots.length})` : ''}</span><span aria-hidden="true">{expanded ? '-' : '+'}</span>
    </button></h2>
    <div id="availability-content" hidden={!expanded}>
      <p>Add 30-minute times clients can book. Times use your device's local time zone.</p>
      <form onSubmit={submit}>
        <p><label htmlFor="slot-date">Date</label><br />
          <input id="slot-date" type="date" min={todayKey()} value={date} onChange={event => setDate(event.target.value)} required disabled={busy} /></p>
        <p><label htmlFor="slot-time">Start time</label><br />
          <input id="slot-time" type="time" value={time} onChange={event => setTime(event.target.value)} required disabled={busy} /></p>
        {error && <p role="alert">{error}</p>}
        {added && <p role="status">Added {localDate(added.starts_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}, {timeLabel(added.starts_at)} - {timeLabel(added.ends_at)}.</p>}
        <button type="submit" disabled={busy}>{busy ? 'Adding...' : 'Add 30-minute slot'}</button>
      </form>
      <h3>Upcoming times</h3>
      {loading ? <p role="status">Loading your availability...</p> : slots.length === 0 ? <p>You have no upcoming times yet. Add one above.</p> :
        <ul className="appointment-list">{slots.map(slot => <li key={slot.id}>
          <p><time dateTime={slot.starts_at}>{localDate(slot.starts_at).toLocaleDateString(undefined, { dateStyle: 'full' })}</time></p>
          <p>{timeLabel(slot.starts_at)} - {timeLabel(slot.ends_at)}</p>
          <p className={slot.booked ? 'slot-state booked' : 'slot-state'}>{slot.booked ? 'Booked' : 'Open'}</p>
        </li>)}</ul>}
    </div>
  </section>
}

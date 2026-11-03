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
  const [editing, setEditing] = useState<number | null>(null)
  const [notice, setNotice] = useState('')

  async function load() {
    setLoading(true)
    setError('')
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
      const response = await fetch(editing === null ? '/api/provider/availability' : `/api/provider/availability/${editing}`, { method: editing === null ? 'POST' : 'PATCH', headers, body: JSON.stringify({ starts_at: startsAt }) })
      if (response.status === 401) { window.location.replace('/login'); return }
      const result = (await response.json()) as { error?: string; slot: Slot }
      if (!response.ok) { setError(result.error ?? 'Could not add this time. Please try again.'); return }
      setAdded(result.slot)
      setNotice(editing === null ? 'Availability added.' : 'Availability updated.')
      setEditing(null)
      setTime('')
      await load()
    } catch { setError('Could not add this time. Please try again.') }
    finally { setBusy(false) }
  }

  function edit(slot: Slot) {
    const start = localDate(slot.starts_at)
    setDate(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`)
    setTime(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`)
    setEditing(slot.id)
    setAdded(null)
    setError('')
    setNotice('')
    document.getElementById('slot-date')?.focus()
  }

  async function remove(slot: Slot) {
    if (busy || !window.confirm('Remove this available time?')) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/provider/availability/${slot.id}`, { method: 'DELETE', headers, body: '{}' })
      if (response.status === 401) { window.location.replace('/login'); return }
      const result = await response.json() as { error?: string }
      if (!response.ok) { setError(result.error ?? 'Could not remove this time.'); return }
      if (editing === slot.id) { setEditing(null); setDate(''); setTime('') }
      setNotice('Availability removed.')
      await load()
    } catch { setError('Could not remove this time. Please retry.') }
    finally { setBusy(false) }
  }

  return <section aria-labelledby="availability-title">
    <h2 id="availability-title"><button className="section-toggle" type="button" aria-expanded={expanded} aria-controls="availability-content" onClick={() => setExpanded(open => !open)}>
      <span>Your availability{!loading ? ` (${slots.length})` : ''}</span><span aria-hidden="true">{expanded ? '-' : '+'}</span>
    </button></h2>
    <div id="availability-content" hidden={!expanded}>
      <p>Add or edit 30-minute times clients can book. Times use your device's local time zone.</p>
      <p>Slots with appointment history cannot be edited or removed, so recorded appointment times stay accurate.</p>
      <form onSubmit={submit}>
        <p><label htmlFor="slot-date">Date</label><br />
          <input id="slot-date" type="date" min={todayKey()} value={date} onChange={event => setDate(event.target.value)} required disabled={busy} /></p>
        <p><label htmlFor="slot-time">Start time</label><br />
          <input id="slot-time" type="time" value={time} onChange={event => setTime(event.target.value)} required disabled={busy} /></p>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}{added ? ` ${localDate(added.starts_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}, ${timeLabel(added.starts_at)} - ${timeLabel(added.ends_at)}.` : ''}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : editing === null ? 'Add 30-minute slot' : 'Save changed time'}</button>
        {editing !== null && <button type="button" className="secondary" disabled={busy} onClick={() => { setEditing(null); setDate(''); setTime('') }}>Cancel editing</button>}
      </form>
      <h3>Upcoming times</h3>
      {loading ? <p role="status">Loading your availability...</p> : slots.length === 0 ? <p>You have no upcoming times yet. Add one above.</p> :
        <ul className="appointment-list">{slots.map(slot => <li key={slot.id}>
          <p><time dateTime={slot.starts_at}>{localDate(slot.starts_at).toLocaleDateString(undefined, { dateStyle: 'full' })}</time></p>
          <p>{timeLabel(slot.starts_at)} - {timeLabel(slot.ends_at)}</p>
          <p className={slot.booked ? 'slot-state booked' : 'slot-state'}>{slot.booked ? 'Booked' : 'Open'}</p>
          <div className="appointment-actions">
            <button type="button" className="secondary" disabled={busy || slot.booked} onClick={() => edit(slot)} aria-label={`Edit time on ${localDate(slot.starts_at).toLocaleString()}`}>Edit time</button>
            <button type="button" className="secondary" disabled={busy || slot.booked} onClick={() => void remove(slot)} aria-label={`Remove time on ${localDate(slot.starts_at).toLocaleString()}`}>Remove</button>
          </div>
        </li>)}</ul>}
    </div>
  </section>
}

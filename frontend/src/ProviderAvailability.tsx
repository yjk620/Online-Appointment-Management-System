import { FormEvent, useEffect, useState } from 'react'
import { localDay } from './dashboard'

type Slot = { id: number; starts_at: string; ends_at: string; booked: boolean }
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' }

function localDate(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(' ', 'T') + 'Z')
}
function timeLabel(value: string) {
  return localDate(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}
// Slots arrive sorted by start time, so grouping in order keeps days and times chronological.
function groupByDay(slots: Slot[]) {
  const days = new Map<string, Slot[]>()
  for (const slot of slots) {
    const key = localDay(localDate(slot.starts_at))
    days.set(key, [...(days.get(key) ?? []), slot])
  }
  return [...days]
}
function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function ProviderAvailability({ refreshVersion = 0, onChanged }: { refreshVersion?: number; onChanged?: () => void }) {
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
  useEffect(() => { void load() }, [refreshVersion])

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
      onChanged?.()
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
      onChanged?.()
    } catch { setError('Could not remove this time. Please retry.') }
    finally { setBusy(false) }
  }

  return <section aria-labelledby="availability-title">
    <h2 id="availability-title"><button className="section-toggle" type="button" aria-expanded={expanded} aria-controls="availability-content" onClick={() => setExpanded(open => !open)}>
      <span>Your availability{!loading ? ` (${slots.length})` : ''}</span><span aria-hidden="true">{expanded ? '−' : '+'}</span>
    </button></h2>
    <div id="availability-content" hidden={!expanded}>
      <p className="section-help">Add 30-minute times clients can book, in your local time zone. Booked times can't be edited or removed, so recorded appointments stay accurate.</p>
      <form className="slot-form" onSubmit={submit}>
        <p><label htmlFor="slot-date">Date</label><br />
          <input id="slot-date" type="date" min={todayKey()} value={date} onChange={event => setDate(event.target.value)} required disabled={busy} /></p>
        <p><label htmlFor="slot-time">Start time</label><br />
          <input id="slot-time" type="time" value={time} onChange={event => setTime(event.target.value)} required disabled={busy} /></p>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status" className="notice">{notice}{added ? ` ${localDate(added.starts_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}, ${timeLabel(added.starts_at)} - ${timeLabel(added.ends_at)}.` : ''}</p>}
        <div className="appointment-actions">
          <button type="submit" disabled={busy}>{busy ? 'Saving...' : editing === null ? 'Add 30-minute slot' : 'Save changed time'}</button>
          {editing !== null && <button type="button" className="secondary" disabled={busy} onClick={() => { setEditing(null); setDate(''); setTime('') }}>Cancel editing</button>}
        </div>
      </form>
      <h3>Upcoming times</h3>
      {loading ? <p role="status">Loading your availability...</p> : slots.length === 0 ? <p className="empty-state">You have no upcoming times yet. Add one above.</p> :
        groupByDay(slots).map(([day, daySlots]) => <div className="slot-day" key={day}>
          <h4><time dateTime={day}>{localDate(daySlots[0].starts_at).toLocaleDateString(undefined, { dateStyle: 'full' })}</time></h4>
          <ul className="slot-list">{daySlots.map(slot => <li key={slot.id} className={editing === slot.id ? 'editing' : undefined}>
            <span className="slot-time">{timeLabel(slot.starts_at)} - {timeLabel(slot.ends_at)}</span>
            <span className={slot.booked ? 'slot-state booked' : 'slot-state'}>{slot.booked ? 'Booked' : 'Open'}</span>
            {!slot.booked && <span className="slot-actions">
              <button type="button" className="secondary" disabled={busy} onClick={() => edit(slot)} aria-label={`Edit time on ${localDate(slot.starts_at).toLocaleString()}`}>Edit</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => void remove(slot)} aria-label={`Remove time on ${localDate(slot.starts_at).toLocaleString()}`}>Remove</button>
            </span>}
          </li>)}</ul>
        </div>)}
    </div>
  </section>
}

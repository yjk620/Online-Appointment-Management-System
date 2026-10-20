import { FormEvent, useEffect, useState } from 'react'

type Slot = { id: number; starts_at: string; ends_at: string; booked: boolean; locked: boolean }
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
function localInputParts(value: string) {
  const date = localDate(value)
  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  }
}

export default function ProviderAvailability() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null)
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
    setMessage('')
    try {
      // The browser reads the date and time in the provider's local time zone; the API stores UTC.
      const startsAt = new Date(`${date}T${time}`).toISOString()
      const response = await fetch(editing ? `/api/provider/availability/${editing}` : '/api/provider/availability', {
        method: editing ? 'PATCH' : 'POST', headers, body: JSON.stringify({ starts_at: startsAt }),
      })
      if (response.status === 401) { window.location.replace('/login'); return }
      const result = (await response.json()) as { error?: string; slot: Slot }
      if (!response.ok) { setError(result.error ?? 'Could not save this time. Please try again.'); return }
      setMessage(`${editing ? 'Updated' : 'Added'} ${localDate(result.slot.starts_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}, ${timeLabel(result.slot.starts_at)} - ${timeLabel(result.slot.ends_at)}.`)
      setEditing(null)
      setDate('')
      setTime('')
      await load()
    } catch { setError('Could not save this time. Please try again.') }
    finally { setBusy(false) }
  }

  function edit(slot: Slot) {
    const values = localInputParts(slot.starts_at)
    setEditing(slot.id)
    setConfirmRemove(null)
    setDate(values.date)
    setTime(values.time)
    setError('')
    setMessage('')
  }

  function cancelEdit() {
    setEditing(null)
    setDate('')
    setTime('')
    setError('')
  }

  async function remove(slot: Slot) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/provider/availability/${slot.id}`, { method: 'DELETE', headers, body: '{}' })
      if (response.status === 401) { window.location.replace('/login'); return }
      const result = (await response.json()) as { error?: string; message?: string }
      if (!response.ok) { setError(result.error ?? 'Could not remove this time. Please try again.'); return }
      setConfirmRemove(null)
      if (editing === slot.id) cancelEdit()
      setMessage(result.message ?? 'Availability removed.')
      await load()
    } catch { setError('Could not remove this time. Please try again.') }
    finally { setBusy(false) }
  }

  return <section aria-labelledby="availability-title">
    <h2 id="availability-title"><button className="section-toggle" type="button" aria-expanded={expanded} aria-controls="availability-content" onClick={() => setExpanded(open => !open)}>
      <span>Your availability{!loading ? ` (${slots.length})` : ''}</span><span aria-hidden="true">{expanded ? '-' : '+'}</span>
    </button></h2>
    <div id="availability-content" hidden={!expanded}>
      <p>{editing ? 'Choose a new start for this 30-minute slot.' : 'Add 30-minute times clients can book.'} Times use your device's local time zone.</p>
      <form onSubmit={submit}>
        <p><label htmlFor="slot-date">Date</label><br />
          <input id="slot-date" type="date" min={todayKey()} value={date} onChange={event => setDate(event.target.value)} required disabled={busy} /></p>
        <p><label htmlFor="slot-time">Start time</label><br />
          <input id="slot-time" type="time" value={time} onChange={event => setTime(event.target.value)} required disabled={busy} /></p>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Add 30-minute slot'}</button>
        {editing && <button type="button" disabled={busy} onClick={cancelEdit}>Cancel editing</button>}
      </form>
      <h3>Upcoming times</h3>
      {loading ? <p role="status">Loading your availability...</p> : slots.length === 0 ? <p>You have no upcoming times yet. Add one above.</p> :
        <ul className="appointment-list">{slots.map(slot => <li key={slot.id}>
          <p><time dateTime={slot.starts_at}>{localDate(slot.starts_at).toLocaleDateString(undefined, { dateStyle: 'full' })}</time></p>
          <p>{timeLabel(slot.starts_at)} - {timeLabel(slot.ends_at)}</p>
          <p className={slot.booked ? 'slot-state booked' : 'slot-state'}>{slot.booked ? 'Booked' : slot.locked ? 'Appointment history retained' : 'Open'}</p>
          {!slot.locked && <div className="appointment-actions">
            <button type="button" disabled={busy} onClick={() => edit(slot)}>Edit time</button>
            {confirmRemove === slot.id ? <>
              <button type="button" disabled={busy} onClick={() => void remove(slot)}>Confirm remove</button>
              <button type="button" disabled={busy} onClick={() => setConfirmRemove(null)}>Keep time</button>
            </> : <button type="button" disabled={busy} onClick={() => { setConfirmRemove(slot.id); cancelEdit() }}>Remove time</button>}
          </div>}
        </li>)}</ul>}
    </div>
  </section>
}

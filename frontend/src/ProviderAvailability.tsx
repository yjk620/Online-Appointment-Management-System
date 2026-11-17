import { FormEvent, useState } from 'react'
import { dateValue, dayLabel, groupByDay, localDay, slotDetails, timeRange, whenLabel } from './dashboard'

export type Slot = { id: number; starts_at: string; ends_at: string; booked: boolean }
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' }

// Data comes from ProviderAppointments, which reloads it through onChanged after every save.
export default function ProviderAvailability({ slots, appointments, onChanged }: { slots: Slot[]; appointments: { starts_at: string; status: string; client_name: string }[]; onChanged: () => Promise<void> }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Slot | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)

  function reset() { setEditing(null); setDate(''); setTime('') }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      // The browser reads the date and time in the provider's local time zone; the API stores UTC.
      const startsAt = new Date(`${date}T${time}`).toISOString()
      const response = await fetch(editing ? `/api/provider/availability/${editing.id}` : '/api/provider/availability', { method: editing ? 'PATCH' : 'POST', headers, body: JSON.stringify({ starts_at: startsAt }) })
      if (response.status === 401) { window.location.replace('/login'); return }
      const result = (await response.json()) as { error?: string }
      if (!response.ok) { setError(result.error ?? 'Could not save this time. Please try again.'); return }
      setNotice(editing ? 'Time updated.' : 'Time added.')
      if (editing) reset(); else setTime('')
      await onChanged()
    } catch { setError('Could not save this time. Please try again.') }
    finally { setBusy(false) }
  }

  function edit(slot: Slot) {
    const start = dateValue(slot.starts_at)
    setDate(localDay(start))
    setTime(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`)
    setEditing(slot); setRemoving(null); setError(''); setNotice('')
    document.getElementById('slot-date')?.focus()
  }

  async function remove(slot: Slot) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(`/api/provider/availability/${slot.id}`, { method: 'DELETE', headers, body: '{}' })
      if (response.status === 401) { window.location.replace('/login'); return }
      const result = await response.json() as { error?: string }
      if (!response.ok) { setError(result.error ?? 'Could not remove this time.'); return }
      if (editing?.id === slot.id) reset()
      setRemoving(null)
      setNotice('Time removed.')
      await onChanged()
    } catch { setError('Could not remove this time. Please retry.') }
    finally { setBusy(false) }
  }

  const days = groupByDay(slotDetails(slots, appointments))
  return <section className="side availability" aria-labelledby="availability-title">
    <h2 id="availability-title">Your availability</h2>
    <p className="booking-step">Add 30-minute times clients can book.</p>
    <form onSubmit={submit}>
      {editing && <p className="editing-note">Editing {whenLabel(editing.starts_at, editing.ends_at)}</p>}
      <div className="slot-form">
        <p><label htmlFor="slot-date">Date</label><input id="slot-date" type="date" min={localDay(new Date())} value={date} onChange={event => setDate(event.target.value)} required disabled={busy} /></p>
        <p><label htmlFor="slot-time">Start time</label><input id="slot-time" type="time" step="1800" value={time} onChange={event => setTime(event.target.value)} required disabled={busy} /></p>
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save' : 'Add slot'}</button>
      </div>
      {editing && <button type="button" className="link" disabled={busy} onClick={reset}>Cancel</button>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
    </form>
    {days.length === 0 ? <p>No upcoming times yet. Add one above.</p> : days.map(group => <div key={group.day} className="slot-day">
      <h3>{dayLabel(group.items[0].starts_at)}</h3>
      <ul>{group.items.map(slot => <li key={slot.id} className={editing?.id === slot.id ? 'editing' : undefined}>
        <span className="slot-time">{timeRange(slot.starts_at, slot.ends_at)}</span>
        {slot.booked ? <span className="slot-state booked">Booked{slot.client ? ` · ${slot.client}` : ''}</span> : <>
          <span className="slot-state">Open</span>
          {/* Confirming swaps the links in place: red Remove takes Edit's spot, so a double-click lands on Keep. */}
          {removing === slot.id ? <span className="slot-links">
            <button type="button" className="link danger" disabled={busy} onClick={() => void remove(slot)} aria-label={`Confirm remove ${whenLabel(slot.starts_at, slot.ends_at)}`}>{busy ? 'Removing...' : 'Remove'}</button>
            <button type="button" className="link" disabled={busy} onClick={() => setRemoving(null)}>Keep</button>
          </span> : <span className="slot-links">
            <button type="button" className="link" disabled={busy} onClick={() => edit(slot)} aria-label={`Edit ${whenLabel(slot.starts_at, slot.ends_at)}`}>Edit</button>
            <button type="button" className="link" disabled={busy} onClick={() => { setRemoving(slot.id); setNotice('') }} aria-label={`Remove ${whenLabel(slot.starts_at, slot.ends_at)}`}>Remove</button>
          </span>}
        </>}
      </li>)}</ul>
    </div>)}
  </section>
}

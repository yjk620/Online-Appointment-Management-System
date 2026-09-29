import { FormEvent, useEffect, useState } from 'react'

type Provider = { id: number; name: string; description: string }
type Slot = { id: number; provider_id: number; starts_at: string; ends_at: string }
type Appointment = { id: number; provider_name: string; starts_at: string; ends_at: string; status: string }
function slotDate(value: string) {
  const zoned = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(' ', 'T') + 'Z'
  return new Date(zoned)
}

function dateLabel(value: string) {
  return slotDate(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function monthStart(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1) }

export default function Booking({ onBooked, expanded, onToggle }: { onBooked: () => void; expanded: boolean; onToggle: () => void }) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [provider, setProvider] = useState('')
  const [slot, setSlot] = useState('')
  const [day, setDay] = useState('')
  const [month, setMonth] = useState(() => monthStart(new Date()))
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState<Appointment | null>(null)
  async function load() {
    setLoading(true)
    setSlot('')
    try {
      const response = await fetch('/api/booking/options', { cache: 'no-store' })
      if (response.status === 401) { window.location.replace('/login'); return }
      if (!response.ok) throw new Error('Could not load booking options. Please retry.')
      const result = (await response.json()) as { providers: Provider[]; slots: Slot[] }
      setProviders(result.providers)
      setSlots(result.slots)
    } catch (error) { setSlots([]); setError(error instanceof Error ? error.message : 'Could not load options.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const available = slots.filter(item => item.provider_id === Number(provider))
  const selectedSlot = available.find(item => item.id === Number(slot) && dayKey(slotDate(item.starts_at)) === day)
  const daysWithSlots = new Set(available.map(item => dayKey(slotDate(item.starts_at))))
  const dailySlots = available.filter(item => dayKey(slotDate(item.starts_at)) === day)
  const firstWeekday = month.getDay()
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const earliestMonth = monthStart(new Date())
  function chooseProvider(value: string) {
    setProvider(value); setSlot(''); setDay(''); setConfirmed(null); setError('')
    const next = slots.filter(item => item.provider_id === Number(value)).sort((a, b) => slotDate(a.starts_at).getTime() - slotDate(b.starts_at).getTime())[0]
    setMonth(monthStart(next ? slotDate(next.starts_at) : new Date()))
  }
  function moveMonth(offset: number) {
    const target = new Date(month.getFullYear(), month.getMonth() + offset, 1)
    setMonth(target < earliestMonth ? earliestMonth : target)
    setDay(''); setSlot('')
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedSlot || busy) return
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
      onBooked()
      setSlots(current => current.filter(item => item.id !== Number(slot)))
      setSlot('')
    } catch { setError('Could not confirm the booking. Refresh available times before retrying.') }
    finally { setBusy(false) }
  }
  return <section aria-labelledby="booking-title">
    <h2 id="booking-title"><button className="section-toggle" type="button" aria-expanded={expanded} aria-controls="booking-content" onClick={onToggle}>
      <span>Book an appointment</span><span aria-hidden="true">{expanded ? '-' : '+'}</span>
    </button></h2>
    <div id="booking-content" hidden={!expanded}>
    <p>Times are shown in your device's local time zone.</p>
    {error && <p role="alert">{error}</p>}
    {confirmed && <div role="status"><h3>Appointment booked</h3><p>{confirmed.provider_name}</p><p>{dateLabel(confirmed.starts_at)} - {dateLabel(confirmed.ends_at)}</p><p>Confirmation #{confirmed.id} - {confirmed.status}</p></div>}
    {loading ? <p role="status">Loading available times...</p> : providers.length === 0 ? <p>No providers are available yet.</p> : <form onSubmit={submit}>
      <p><label htmlFor="booking-provider">Provider</label><br />
        <select id="booking-provider" required disabled={busy} value={provider} onChange={event => chooseProvider(event.target.value)}>
          <option value="">Choose a provider</option>{providers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></p>
      {provider && <p>{providers.find(item => item.id === Number(provider))?.description}</p>}
      {provider && <>
        <h3>Choose a date</h3>
        <div className="booking-calendar">
          <div className="calendar-navigation">
            <button type="button" aria-label="Previous month" disabled={busy || month <= earliestMonth} onClick={() => moveMonth(-1)}>Previous</button>
            <strong aria-live="polite">{monthLabel}</strong>
            <button type="button" aria-label="Next month" disabled={busy} onClick={() => moveMonth(1)}>Next</button>
          </div>
          <div className="calendar-days" role="group" aria-label={`Available dates in ${monthLabel}`}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(label => <span className="weekday" key={label} aria-hidden="true">{label}</span>)}
            {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const date = new Date(month.getFullYear(), month.getMonth(), index + 1)
              const key = dayKey(date)
              return <button key={key} type="button" disabled={busy || !daysWithSlots.has(key)} aria-pressed={day === key}
                aria-current={key === dayKey(new Date()) ? 'date' : undefined}
                aria-label={date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                onClick={() => { setDay(key); setSlot(''); setConfirmed(null) }}>{index + 1}</button>
            })}
          </div>
          <p className="calendar-help">Only dates with available appointments can be selected.</p>
        </div>
        {!available.some(item => { const date = slotDate(item.starts_at); return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth() }) && <p>No available appointments this month. Try another month or provider.</p>}
        {day && <div role="group" aria-label="Available times">
          <h3>Choose a time</h3>
          <div className="booking-times">{dailySlots.map(item => <button key={item.id} type="button" disabled={busy}
            aria-pressed={slot === String(item.id)} onClick={() => { setSlot(String(item.id)); setConfirmed(null) }}>
            {slotDate(item.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })} - {slotDate(item.ends_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
          </button>)}</div>
          {dailySlots.length === 0 && <p>No times remain on this date. Choose another date.</p>}
        </div>}
      </>}
      {selectedSlot && <div className="booking-review" aria-live="polite">
        <h3>Review your appointment</h3>
        <p>{providers.find(item => item.id === Number(provider))?.name}</p>
        <p>{dateLabel(selectedSlot.starts_at)} - {dateLabel(selectedSlot.ends_at)}</p>
        <p>Your appointment is saved only after you confirm.</p>
        <button disabled={busy} type="submit">{busy ? 'Booking...' : 'Confirm appointment'}</button>
      </div>}
    </form>}
    <p><button disabled={busy || loading} onClick={() => { setError(''); setSlot(''); void load() }}>Refresh available times</button></p>
    </div>
  </section>
}

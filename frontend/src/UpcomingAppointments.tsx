import { useEffect, useState } from 'react'
import { relativeLabel, upcoming, whenLabel } from './dashboard'

type Appointment = { id: number; provider_id: number; provider_name: string; starts_at: string; ends_at: string; status: string }
type Slot = { id: number; provider_id: number; starts_at: string; ends_at: string }
type Action = { id: number; kind: 'cancel' | 'reschedule' }
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' }

export default function UpcomingAppointments({ refreshVersion, onChanged }: { refreshVersion: number; onChanged: () => void }) {
  // null until the first load, so background reloads keep showing the current list instead of a loading flash.
  const [appointments, setAppointments] = useState<Appointment[] | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [action, setAction] = useState<Action | null>(null)
  const [openSlots, setOpenSlots] = useState<Slot[] | null>(null)
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  // null = automatic until the client toggles it themselves.
  const [laterOpen, setLaterOpen] = useState<boolean | null>(null)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer) }, [])
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setError('')
      try {
        const response = await fetch('/api/appointments', { cache: 'no-store', signal: controller.signal })
        if (response.status === 401) { window.location.replace('/login'); return }
        if (!response.ok) throw new Error(response.status === 403 ? 'Client access is required to view appointments.' : 'Could not load your appointments. Please retry.')
        const result = (await response.json()) as { appointments: Appointment[] }
        if (!controller.signal.aborted) { setAppointments(result.appointments); setNow(Date.now()) }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load appointments.')
      }
    }
    void load()
    return () => controller.abort()
  }, [refreshVersion, retry])

  function close() { setAction(null); setOpenSlots(null); setChoice(''); setActionError('') }

  async function startReschedule(item: Appointment) {
    setAction({ id: item.id, kind: 'reschedule' }); setOpenSlots(null); setChoice(''); setActionError(''); setNotice('')
    try {
      const response = await fetch('/api/booking/options', { cache: 'no-store' })
      if (response.status === 401) { window.location.replace('/login'); return }
      if (!response.ok) throw new Error()
      const result = (await response.json()) as { slots: Slot[] }
      setOpenSlots(result.slots.filter(slot => slot.provider_id === item.provider_id))
    } catch { setActionError('Could not load open times. Please try again.'); setOpenSlots([]) }
  }

  async function send(item: Appointment, kind: Action['kind']) {
    setBusy(true); setActionError('')
    try {
      const response = await fetch(`/api/appointments/${item.id}/${kind}`, {
        method: 'POST', headers, body: JSON.stringify(kind === 'reschedule' ? { availability_id: Number(choice) } : {}),
      })
      if (response.status === 401) { window.location.replace('/login'); return }
      const result = (await response.json()) as { error?: string; appointment?: Appointment }
      if (!response.ok) {
        setActionError(result.error ?? 'Could not update the appointment. Please try again.')
        if (kind === 'reschedule' && response.status === 409) await startReschedule(item)
        return
      }
      setNotice(kind === 'cancel'
        ? `Cancelled your appointment with ${item.provider_name}.`
        : `Moved confirmation #${item.id} to ${whenLabel(result.appointment!.starts_at, result.appointment!.ends_at)}.`)
      close()
      onChanged()
    } catch { setActionError('Could not update the appointment. Please try again.') }
    finally { setBusy(false) }
  }

  function details(item: Appointment) {
    return <>
      <h3>{item.provider_name}</h3>
      <p className="appointment-when"><time dateTime={item.starts_at}>{whenLabel(item.starts_at, item.ends_at)}</time></p>
      <p className="appointment-meta">{relativeLabel(item.starts_at, now)} · Confirmation #{item.id}</p>
      {action?.id !== item.id ? <div className="appointment-actions">
        <button type="button" className="secondary" onClick={() => void startReschedule(item)}>Reschedule</button>
        <button type="button" className="secondary" onClick={() => { close(); setNotice(''); setAction({ id: item.id, kind: 'cancel' }) }}>Cancel appointment</button>
      </div> : action.kind === 'cancel' ? <div className="appointment-change" role="group" aria-label="Confirm cancellation">
        <p>Cancel this appointment? The time becomes available to other clients.</p>
        {actionError && <p role="alert">{actionError}</p>}
        <div className="appointment-actions">
          <button type="button" className="destructive" disabled={busy} onClick={() => void send(item, 'cancel')}>{busy ? 'Cancelling...' : 'Yes, cancel'}</button>
          <button type="button" className="secondary" disabled={busy} onClick={close}>Keep it</button>
        </div>
      </div> : <div className="appointment-change" role="group" aria-label="Choose a new time">
        {openSlots === null ? <p role="status">Loading open times...</p> : openSlots.length === 0 ? <p>No other times are open with {item.provider_name} right now.</p> : <p>
          <label htmlFor={`reschedule-${item.id}`}>New time with {item.provider_name}</label>
          <select id={`reschedule-${item.id}`} value={choice} disabled={busy} onChange={event => setChoice(event.target.value)}>
            <option value="">Choose a time</option>
            {openSlots.map(slot => <option key={slot.id} value={slot.id}>{whenLabel(slot.starts_at, slot.ends_at)}</option>)}
          </select></p>}
        {actionError && <p role="alert">{actionError}</p>}
        <div className="appointment-actions">
          <button type="button" disabled={busy || !choice} onClick={() => void send(item, 'reschedule')}>{busy ? 'Moving...' : 'Move appointment'}</button>
          <button type="button" className="secondary" disabled={busy} onClick={close}>Back</button>
        </div>
      </div>}
    </>
  }

  const [next, ...later] = upcoming(appointments ?? [], now)
  // Open for 1-2 later bookings; collapse at 3+ so booking stays near the top on phones.
  const expanded = laterOpen ?? later.length <= 2
  return <>
    <section className="next-appointment" aria-labelledby="next-title">
      <h2 id="next-title">Next appointment</h2>
      {notice && <p role="status" className="notice">{notice}</p>}
      {error ? <><p role="alert">{error}</p><button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>Retry</button></>
        : appointments === null ? <p role="status">Loading your appointments...</p>
        : !next ? <p>No upcoming appointments. <a href="#booking-title">Book an appointment</a> to get started.</p>
        : <div className="appointment-card">{details(next)}</div>}
    </section>
    {!error && later.length > 0 && <section aria-labelledby="upcoming-title">
      <h2 id="upcoming-title"><button className="section-toggle" type="button" aria-expanded={expanded} aria-controls="upcoming-content" onClick={() => setLaterOpen(!expanded)}>
        <span>Later appointments ({later.length})</span>
      </button></h2>
      <ul id="upcoming-content" className="appointment-list" hidden={!expanded}>{later.map(item => <li key={item.id}>{details(item)}</li>)}</ul>
    </section>}
  </>
}

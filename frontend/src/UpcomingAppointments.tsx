import { useEffect, useState } from 'react'

type Appointment = { id: number; provider_id: number; provider_name: string; starts_at: string; ends_at: string; status: string }
type Slot = { id: number; provider_id: number; starts_at: string; ends_at: string }
type Action = { id: number; kind: 'cancel' | 'reschedule' }
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' }
function localDate(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(' ', 'T') + 'Z')
}
function timeLabel(value: string) {
  return localDate(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

export default function UpcomingAppointments({ refreshVersion, expanded, onToggle, onChanged }: { refreshVersion: number; expanded: boolean; onToggle: () => void; onChanged: () => void }) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [action, setAction] = useState<Action | null>(null)
  const [openSlots, setOpenSlots] = useState<Slot[] | null>(null)
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/appointments', { cache: 'no-store', signal: controller.signal })
        if (response.status === 401) { window.location.replace('/login'); return }
        if (!response.ok) throw new Error(response.status === 403 ? 'Client access is required to view appointments.' : 'Could not load your appointments. Please retry.')
        const result = (await response.json()) as { appointments: Appointment[] }
        if (!controller.signal.aborted) setAppointments(result.appointments)
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load appointments.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
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
        : `Moved confirmation #${item.id} to ${localDate(result.appointment!.starts_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}, ${timeLabel(result.appointment!.starts_at)}.`)
      close()
      onChanged()
    } catch { setActionError('Could not update the appointment. Please try again.') }
    finally { setBusy(false) }
  }

  return <section aria-labelledby="upcoming-title">
    <h2 id="upcoming-title"><button className="section-toggle" type="button" aria-expanded={expanded} aria-controls="upcoming-content" onClick={onToggle}>
      <span>Upcoming appointments{!loading && !error ? ` (${appointments.length})` : ''}</span><span aria-hidden="true">{expanded ? '-' : '+'}</span>
    </button></h2>
    <div id="upcoming-content" hidden={!expanded}>
    <p>Times are shown in your device's local time zone.</p>
    {notice && <p role="status" className="notice">{notice}</p>}
    {loading ? <p role="status">Loading your appointments...</p> : error ? <p role="alert">{error}</p> : appointments.length === 0 ? <p>You have no upcoming appointments. Choose a provider below to book one.</p> :
      <ul className="appointment-list">{appointments.map(item => <li key={item.id}>
        <h3>{item.provider_name}</h3>
        <p><time dateTime={item.starts_at}>{localDate(item.starts_at).toLocaleDateString(undefined, { dateStyle: 'full' })}</time></p>
        <p>{timeLabel(item.starts_at)} - {timeLabel(item.ends_at)}</p>
        <p>Status: {item.status}</p><p>Confirmation #{item.id}</p>
        {action?.id !== item.id ? <div className="appointment-actions">
          <button type="button" className="secondary" onClick={() => void startReschedule(item)}>Reschedule</button>
          <button type="button" className="secondary" onClick={() => { close(); setNotice(''); setAction({ id: item.id, kind: 'cancel' }) }}>Cancel appointment</button>
        </div> : action.kind === 'cancel' ? <div className="appointment-change" role="group" aria-label="Confirm cancellation">
          <p>Cancel this appointment? The time becomes available to other clients.</p>
          {actionError && <p role="alert">{actionError}</p>}
          <div className="appointment-actions">
            <button type="button" disabled={busy} onClick={() => void send(item, 'cancel')}>{busy ? 'Cancelling...' : 'Yes, cancel'}</button>
            <button type="button" className="secondary" disabled={busy} onClick={close}>Keep it</button>
          </div>
        </div> : <div className="appointment-change" role="group" aria-label="Choose a new time">
          {openSlots === null ? <p role="status">Loading open times...</p> : openSlots.length === 0 ? <p>No other times are open with {item.provider_name} right now.</p> : <p>
            <label htmlFor={`reschedule-${item.id}`}>New time with {item.provider_name}</label>
            <select id={`reschedule-${item.id}`} value={choice} disabled={busy} onChange={event => setChoice(event.target.value)}>
              <option value="">Choose a time</option>
              {openSlots.map(slot => <option key={slot.id} value={slot.id}>{localDate(slot.starts_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, {timeLabel(slot.starts_at)} - {timeLabel(slot.ends_at)}</option>)}
            </select></p>}
          {actionError && <p role="alert">{actionError}</p>}
          <div className="appointment-actions">
            <button type="button" disabled={busy || !choice} onClick={() => void send(item, 'reschedule')}>{busy ? 'Moving...' : 'Move appointment'}</button>
            <button type="button" className="secondary" disabled={busy} onClick={close}>Back</button>
          </div>
        </div>}
      </li>)}</ul>}
    <button disabled={loading} onClick={() => setRetry(value => value + 1)}>{error ? 'Retry appointments' : 'Refresh appointments'}</button>
    </div>
  </section>
}

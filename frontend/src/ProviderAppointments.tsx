import { useEffect, useState } from 'react'
import ProviderAvailability, { type Slot } from './ProviderAvailability'
import { dateValue, filterAppointments, isSoon, openSlots, relativeLabel, statusTag, whenLabel } from './dashboard'

export type ProviderAppointment = { id: number; client_name: string; client_email: string; starts_at: string; ends_at: string; status: string }
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' }

// Provider home: one load feeds the summary, the appointment sections and the availability column.
export default function ProviderAppointments({ refreshVersion = 0 }: { refreshVersion?: number }) {
  // null until the first load, so background reloads keep the current view instead of flashing "Loading".
  const [appointments, setAppointments] = useState<ProviderAppointment[] | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(Date.now())
  const [pending, setPending] = useState<{ id: number; status: string } | null>(null)
  // null = automatic until the provider toggles it themselves.
  const [laterOpen, setLaterOpen] = useState<boolean | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [day, setDay] = useState('')
  const [status, setStatus] = useState('')

  async function load() {
    setError('')
    try {
      const [response, availability] = await Promise.all([
        fetch('/api/provider/appointments', { cache: 'no-store' }),
        fetch('/api/provider/availability', { cache: 'no-store' }),
      ])
      if (response.status === 401 || availability.status === 401) { window.location.replace('/login'); return }
      if (!response.ok || !availability.ok) throw new Error('Could not load your schedule. Please retry.')
      setAppointments((await response.json() as { appointments: ProviderAppointment[] }).appointments)
      setSlots((await availability.json() as { slots: Slot[] }).slots)
      setNow(Date.now())
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not load your schedule.') }
  }
  useEffect(() => { void load() }, [refreshVersion])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer) }, [])

  async function saveStatus() {
    if (!pending || busy) return
    setBusy(true); setActionError(''); setNotice('')
    try {
      const response = await fetch(`/api/provider/appointments/${pending.id}/status`, {
        method: 'PATCH', headers, body: JSON.stringify({ status: pending.status }),
      })
      if (response.status === 401) { window.location.replace('/login'); return }
      const result = await response.json() as { error?: string }
      if (!response.ok) { setActionError(result.error ?? 'Could not update this appointment. Please retry.'); return }
      setNotice(`Confirmation #${pending.id} marked ${pending.status === 'no-show' ? 'as a no-show' : 'completed'}.`)
      setPending(null)
      await load()
    } catch { setActionError('Could not update this appointment. Please retry.') }
    finally { setBusy(false) }
  }

  // Scheduled cards lead with the relative time ("in 3 hours", highlighted today and tomorrow); history cards don't.
  function card(item: ProviderAppointment) {
    const tag = statusTag(item, now)
    const started = item.status === 'scheduled' && dateValue(item.starts_at).getTime() <= now
    return <>
      <h3>{item.client_name}{tag && <>{' '}<span className={`tag ${tag.tone}`}>{tag.label}</span></>}</h3>
      <p className={`appointment-when${item.status === 'cancelled' ? ' cancelled' : ''}`}><time dateTime={item.starts_at}>{whenLabel(item.starts_at, item.ends_at)}</time></p>
      <p className="appointment-meta">
        {item.status === 'scheduled' && <><span className={isSoon(item.starts_at, now) ? 'soon' : undefined}>{started ? `Started ${relativeLabel(item.starts_at, now)}` : relativeLabel(item.starts_at, now)}</span> · </>}
        Confirmation #{item.id} · <a href={`mailto:${item.client_email}`}>{item.client_email}</a>
      </p>
      {started && (pending?.id !== item.id ? <div className="appointment-actions">
        <button type="button" disabled={busy} onClick={() => { setActionError(''); setPending({ id: item.id, status: 'completed' }) }}>Mark completed</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => { setActionError(''); setPending({ id: item.id, status: 'no-show' }) }}>Mark no-show</button>
      </div> : <div className="appointment-change" role="group" aria-label="Confirm outcome">
        <p>Mark {item.client_name} as {pending.status === 'no-show' ? 'a no-show' : 'completed'}? This can't be changed.</p>
        {actionError && <p role="alert">{actionError}</p>}
        <div className="appointment-actions">
          <button type="button" disabled={busy} onClick={() => void saveStatus()}>{busy ? 'Saving...' : pending.status === 'no-show' ? 'Mark no-show' : 'Mark completed'}</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setPending(null)}>Keep scheduled</button>
        </div>
      </div>)}
    </>
  }

  if (error && !appointments) return <><p role="alert">{error}</p><button type="button" className="secondary" onClick={() => void load()}>Retry</button></>
  if (!appointments) return <p role="status">Loading your schedule...</p>

  // Each appointment lives in one place: Next/Later until it ends, then Needs an outcome, then History once marked.
  const scheduled = appointments.filter(item => item.status === 'scheduled')
    .sort((a, b) => dateValue(a.starts_at).getTime() - dateValue(b.starts_at).getTime())
  const needsOutcome = scheduled.filter(item => dateValue(item.ends_at).getTime() <= now)
  const [next, ...rest] = scheduled.filter(item => dateValue(item.ends_at).getTime() > now)
  // A second card only when it starts within an hour of the first one ending, so back-to-back sessions are visible.
  const soon = next && rest[0] && dateValue(rest[0].starts_at).getTime() - dateValue(next.ends_at).getTime() <= 3600000 ? [next, rest[0]] : next ? [next] : []
  const later = rest.slice(soon.length - 1)
  const laterExpanded = laterOpen ?? later.length <= 2
  const open = openSlots(slots, now).length
  const history = appointments.filter(item => item.status !== 'scheduled')
  const visible = filterAppointments(history, 'all', day, status, now).reverse()
  return <>
    <p className="home-summary">
      {needsOutcome.length > 0 && <>{needsOutcome.length} need{needsOutcome.length === 1 ? 's' : ''} an outcome · </>}
      {soon.length + later.length} upcoming · {open} open slot{open === 1 ? '' : 's'}
    </p>
    {error && <><p role="alert">{error}</p><button type="button" className="secondary" onClick={() => void load()}>Retry</button></>}
    {notice && <p role="status" className="notice">{notice}</p>}
    <div className="home-grid">
      {needsOutcome.length > 0 && <section className="needs-outcome" aria-labelledby="needs-outcome-title">
        <h2 id="needs-outcome-title">Needs an outcome ({needsOutcome.length})</h2>
        <ul className="appointment-list">{needsOutcome.map(item => <li key={item.id}>{card(item)}</li>)}</ul>
      </section>}
      <section className="next-appointment" aria-labelledby="next-title">
        <h2 id="next-title">{soon.length > 1 ? 'Next appointments' : 'Next appointment'}</h2>
        {next ? soon.map(item => <div key={item.id} className="appointment-card">{card(item)}</div>)
          : <p>No upcoming appointments. <a href="#availability-title">Add open times</a> so clients can book.</p>}
      </section>
      {later.length > 0 && <section aria-labelledby="later-title">
        <h2 id="later-title"><button className="section-toggle" type="button" aria-expanded={laterExpanded} aria-controls="later-content" onClick={() => setLaterOpen(!laterExpanded)}>
          <span>Later appointments ({later.length})</span>
        </button></h2>
        <ul id="later-content" className="appointment-list" hidden={!laterExpanded}>{later.map(item => <li key={item.id}>{card(item)}</li>)}</ul>
      </section>}
      <ProviderAvailability slots={slots} appointments={appointments} onChanged={load} />
      <section aria-labelledby="history-title">
        <h2 id="history-title"><button className="section-toggle" type="button" aria-expanded={historyOpen} aria-controls="history-content" onClick={() => setHistoryOpen(value => !value)}>
          <span>History ({history.length})</span>
        </button></h2>
        <div id="history-content" hidden={!historyOpen}>
          <div className="filter-row">
            <p><label htmlFor="appointment-date">Date</label><input id="appointment-date" type="date" value={day} onChange={event => setDay(event.target.value)} /></p>
            <p><label htmlFor="appointment-status">Status</label><select id="appointment-status" value={status} onChange={event => setStatus(event.target.value)}>
              <option value="">All statuses</option><option value="completed">Completed</option><option value="no-show">No-show</option><option value="cancelled">Cancelled</option>
            </select></p>
            {(day || status) && <button type="button" className="link" onClick={() => { setDay(''); setStatus('') }}>Clear filters</button>}
          </div>
          {visible.length === 0 ? <p role="status">{history.length === 0 ? 'Completed, no-show and cancelled appointments will appear here.' : 'No appointments match these filters.'}</p> :
            <ul className="appointment-list">{visible.map(item => <li key={item.id}>{card(item)}</li>)}</ul>}
        </div>
      </section>
    </div>
  </>
}

export type TimedAppointment = { starts_at: string; status: string }
export type AvailableSlot = { provider_id?: number; starts_at: string; booked?: boolean }

export function dateValue(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(' ', 'T') + 'Z')
}

export function localDay(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export function upcoming<T extends TimedAppointment>(appointments: T[], now = Date.now()) {
  return appointments.filter(item => item.status === 'scheduled' && dateValue(item.starts_at).getTime() > now)
    .sort((a, b) => dateValue(a.starts_at).getTime() - dateValue(b.starts_at).getTime())
}

export function openSlots<T extends AvailableSlot>(slots: T[], now = Date.now()) {
  return slots.filter(slot => !slot.booked && dateValue(slot.starts_at).getTime() > now)
}

export function filterAppointments<T extends TimedAppointment>(appointments: T[], view: string, day: string, status: string, now = Date.now()) {
  return appointments.filter(item => {
    const isUpcoming = item.status === 'scheduled' && dateValue(item.starts_at).getTime() > now
    return (view === 'all' || (view === 'upcoming' ? isUpcoming : !isUpcoming))
      && (!day || localDay(dateValue(item.starts_at)) === day)
      && (!status || item.status === status)
  }).sort((a, b) => dateValue(a.starts_at).getTime() - dateValue(b.starts_at).getTime())
}

export function filterProviders<T extends { id: number; name: string; description: string }>(providers: T[], slots: AvailableSlot[], query: string, availableOnly: boolean, now = Date.now()) {
  const term = query.trim().toLocaleLowerCase()
  const available = new Set(openSlots(slots, now).map(slot => slot.provider_id))
  return providers.filter(provider => `${provider.name} ${provider.description}`.toLocaleLowerCase().includes(term)
    && (!availableOnly || available.has(provider.id)))
}

// "Wed, Nov 18"; other years add the year ("Mon, Nov 10, 2025") so old history isn't mistaken for this month.
export function dayLabel(value: string, now = Date.now()) {
  const date = dateValue(value)
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: date.getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' })
}

// "8:00 – 8:30 AM". A slot ending at midnight stays "11:30 PM – 12:00 AM": formatRange would add both full dates.
export function timeRange(starts_at: string, ends_at: string) {
  const format = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
  const start = dateValue(starts_at), end = dateValue(ends_at)
  return localDay(start) === localDay(end) ? format.formatRange(start, end) : `${format.format(start)} – ${format.format(end)}`
}

// "Wed, Nov 18 · 8:00 – 8:30 AM" in the viewer's locale and time zone.
export function whenLabel(starts_at: string, ends_at: string) {
  return `${dayLabel(starts_at)} · ${timeRange(starts_at, ends_at)}`
}

// Booked slots get the client's name. Matching on starts_at is safe: one slot per provider per start time.
export function slotDetails<S extends { starts_at: string; booked: boolean }>(slots: S[], appointments: { starts_at: string; status: string; client_name: string }[]) {
  return slots.map(slot => ({
    ...slot,
    client: slot.booked ? appointments.find(item => item.starts_at === slot.starts_at && item.status !== 'cancelled')?.client_name : undefined,
  }))
}

// Consecutive items on the same local day, in the order given.
export function groupByDay<T extends { starts_at: string }>(items: T[]) {
  const groups: { day: string; items: T[] }[] = []
  for (const item of items) {
    const day = localDay(dateValue(item.starts_at))
    if (groups.at(-1)?.day === day) groups.at(-1)!.items.push(item)
    else groups.push({ day, items: [item] })
  }
  return groups
}

// "in 25 minutes", "in 3 hours" (later today), "tomorrow", "in 2 days" (calendar days, so DST-safe); past times read "2 hours ago".
export function relativeLabel(starts_at: string, now = Date.now()) {
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const start = dateValue(starts_at)
  const minutes = Math.round((start.getTime() - now) / 60000)
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute')
  const today = new Date(now)
  const days = Math.round((new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000)
  return days === 0 ? format.format(Math.round(minutes / 60), 'hour') : format.format(days, 'day')
}

// "Eastern Time" for America/Toronto; falls back to the IANA name.
export function timeZoneLabel() {
  return new Intl.DateTimeFormat(undefined, { timeZoneName: 'longGeneric' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone
}

// One coloured tag per card. Scheduled cards get none (every upcoming card is scheduled) except while in progress;
// ended ones sit in the amber Needs an outcome section, which already says so.
export function statusTag(item: { starts_at: string; ends_at: string; status: string }, now = Date.now()) {
  if (item.status === 'scheduled') {
    const at = (value: string) => dateValue(value).getTime()
    return at(item.starts_at) <= now && now < at(item.ends_at) ? { label: 'Now', tone: 'green' } : null
  }
  return item.status === 'no-show' ? { label: 'No-show', tone: 'red' } : { label: item.status.charAt(0).toUpperCase() + item.status.slice(1), tone: 'grey' }
}

// True for today and tomorrow, so the relative time can be highlighted.
export function isSoon(starts_at: string, now = Date.now()) {
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  const day = localDay(dateValue(starts_at))
  return day === localDay(new Date(now)) || day === localDay(tomorrow)
}

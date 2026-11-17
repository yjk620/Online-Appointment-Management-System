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

// "Wed, Nov 18 · 8:00 – 8:30 AM" in the viewer's locale and time zone.
export function whenLabel(starts_at: string, ends_at: string) {
  const start = dateValue(starts_at)
  return `${start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).formatRange(start, dateValue(ends_at))}`
}

// "in 25 minutes", "in 3 hours" (later today), "tomorrow", "in 2 days" (calendar days, so DST-safe).
export function relativeLabel(starts_at: string, now = Date.now()) {
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const start = dateValue(starts_at)
  const minutes = Math.round((start.getTime() - now) / 60000)
  if (minutes < 60) return format.format(minutes, 'minute')
  const today = new Date(now)
  const days = Math.round((new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000)
  return days === 0 ? format.format(Math.round(minutes / 60), 'hour') : format.format(days, 'day')
}

// "Eastern Time" for America/Toronto; falls back to the IANA name.
export function timeZoneLabel() {
  return new Intl.DateTimeFormat(undefined, { timeZoneName: 'longGeneric' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone
}

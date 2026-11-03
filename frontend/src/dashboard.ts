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

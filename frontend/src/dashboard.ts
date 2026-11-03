export type TimedAppointment = { starts_at: string; status: string }
export type AvailableSlot = { provider_id?: number; starts_at: string; booked?: boolean }

export function dateValue(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(' ', 'T') + 'Z')
}

export function upcoming<T extends TimedAppointment>(appointments: T[], now = Date.now()) {
  return appointments.filter(item => item.status === 'scheduled' && dateValue(item.starts_at).getTime() > now)
    .sort((a, b) => dateValue(a.starts_at).getTime() - dateValue(b.starts_at).getTime())
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { dateValue, filterAppointments, filterProviders, localDay, openSlots, upcoming } from '../src/dashboard.ts'

process.env.TZ = 'America/Toronto'
const now = Date.parse('2026-11-03T15:00:00Z')
const appointments = [
  { id: 1, starts_at: '2026-11-04T15:00:00Z', status: 'scheduled' },
  { id: 2, starts_at: '2026-11-03T16:00:00Z', status: 'scheduled' },
  { id: 3, starts_at: '2026-11-02T15:00:00Z', status: 'completed' },
  { id: 4, starts_at: '2026-11-04T17:00:00Z', status: 'cancelled' },
  { id: 5, starts_at: '2026-11-03T14:00:00Z', status: 'scheduled' },
  { id: 6, starts_at: '2026-11-02T16:00:00Z', status: 'no-show' },
]
test('client summary picks earliest scheduled future booking without mutating input', () => {
  assert.deepEqual(upcoming(appointments, now).map(item => item.id), [2, 1])
  assert.equal(appointments[0].id, 1)
})
test('empty and terminal-only client summaries have no next booking', () => {
  assert.deepEqual(upcoming([], now), [])
  assert.deepEqual(upcoming(appointments.filter(item => item.status !== 'scheduled'), now), [])
})
test('a changed or cancelled booking changes summary totals', () => {
  assert.equal(upcoming(appointments.map(item => item.id === 2 ? { ...item, status: 'cancelled' } : item), now).length, 1)
})
test('provider open count excludes past, invalid and booked slots', () => {
  assert.equal(openSlots([
    { starts_at: '2026-11-04T15:00:00Z', booked: false },
    { starts_at: '2026-11-04T15:00:00Z', booked: true },
    { starts_at: '2026-11-02T15:00:00Z', booked: false },
    { starts_at: 'invalid', booked: false },
  ], now).length, 1)
})
test('provider views preserve existing upcoming and historical partitions', () => {
  assert.deepEqual(filterAppointments(appointments, 'upcoming', '', '', now).map(item => item.id), [2, 1])
  assert.deepEqual(filterAppointments(appointments, 'history', '', '', now).map(item => item.id), [3, 6, 5, 4])
})
test('provider date and status filters combine and all statuses can be selected', () => {
  assert.deepEqual(filterAppointments(appointments, 'all', '2026-11-03', 'scheduled', now).map(item => item.id), [5, 2])
  assert.deepEqual(filterAppointments(appointments, 'all', '', 'no-show', now).map(item => item.id), [6])
  assert.deepEqual(filterAppointments(appointments, 'all', '2026-12-01', '', now), [])
})
test('local dates handle UTC midnight and daylight-saving offsets', () => {
  assert.equal(localDay(dateValue('2026-11-03T02:00:00Z')), '2026-11-02')
  assert.equal(localDay(dateValue('2026-11-01T01:30:00-04:00')), '2026-11-01')
  assert.equal(localDay(dateValue('2026-11-01T01:30:00-05:00')), '2026-11-01')
  assert.equal(dateValue('2026-11-03 16:00:00').toISOString(), '2026-11-03T16:00:00.000Z')
})
const providers = [
  { id: 1, name: 'Alex Morgan', description: 'Career services' },
  { id: 2, name: 'Priya Shah', description: 'Financial planning' },
  { id: 3, name: 'Omar Haddad', description: '' },
]
const slots = [
  { provider_id: 1, starts_at: '2026-11-04T15:00:00Z' },
  { provider_id: 2, starts_at: '2026-11-02T15:00:00Z' },
]
test('provider search matches name or description, ignoring case and surrounding spaces', () => {
  assert.equal(filterProviders(providers, slots, '  ALEX ', false, now)[0].id, 1)
  assert.equal(filterProviders(providers, slots, 'FINANCIAL', false, now)[0].id, 2)
})
test('availability-only search requires an open future slot', () => {
  assert.deepEqual(filterProviders(providers, slots, '', true, now).map(item => item.id), [1])
  assert.deepEqual(filterProviders(providers, slots, 'Priya', true, now), [])
})
test('clear search restores all providers and no-match search is empty', () => {
  assert.equal(filterProviders(providers, slots, '', false, now).length, 3)
  assert.deepEqual(filterProviders(providers, slots, 'unmatched', false, now), [])
})
test('provider search does not change the supplied records', () => {
  filterProviders(providers, slots, 'alex', true, now)
  assert.equal(providers.length, 3)
  assert.equal(slots.length, 2)
})

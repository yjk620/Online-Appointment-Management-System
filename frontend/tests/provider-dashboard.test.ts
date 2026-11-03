import test from 'node:test'
import assert from 'node:assert/strict'
import { dateValue, filterAppointments, localDay, openSlots } from '../src/dashboard.ts'

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

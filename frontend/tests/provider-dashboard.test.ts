import test from 'node:test'
import assert from 'node:assert/strict'
import { dateValue, filterAppointments, groupByDay, isSoon, localDay, openSlots, slotDetails, statusTag } from '../src/dashboard.ts'

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
test('availability rows show the booked client and lock slots with any booking history', () => {
  const slots = [
    { id: 1, starts_at: '2026-11-04T15:00:00Z', booked: true },
    { id: 2, starts_at: '2026-11-04T16:00:00Z', booked: false },
    { id: 3, starts_at: '2026-11-05T15:00:00Z', booked: false },
  ]
  const booked = [
    { starts_at: '2026-11-04T15:00:00Z', status: 'cancelled', client_name: 'Old Client' },
    { starts_at: '2026-11-04T15:00:00Z', status: 'scheduled', client_name: 'Jamie Lee' },
    { starts_at: '2026-11-04T16:00:00Z', status: 'cancelled', client_name: 'Taylor Kim' },
  ]
  assert.deepEqual(slotDetails(slots, booked).map(slot => [slot.client, slot.locked]), [['Jamie Lee', true], [undefined, true], [undefined, false]])
})
test('availability groups slots by local day, not UTC day', () => {
  // 11 p.m. Toronto on Nov 4 is Nov 5 in UTC, but belongs with the Nov 4 group.
  const groups = groupByDay([{ starts_at: '2026-11-04T15:00:00Z' }, { starts_at: '2026-11-05T04:00:00Z' }, { starts_at: '2026-11-05T15:00:00Z' }])
  assert.deepEqual(groups.map(group => [group.day, group.items.length]), [['2026-11-04', 2], ['2026-11-05', 1]])
})

test('status tags follow the appointment lifecycle', () => {
  const at = Date.parse('2026-11-03T15:10:00Z')
  const slot = { starts_at: '2026-11-03T15:00:00Z', ends_at: '2026-11-03T15:30:00Z' }
  assert.equal(statusTag({ ...slot, status: 'scheduled' }, Date.parse('2026-11-03T14:00:00Z')), null)
  assert.equal(statusTag({ ...slot, status: 'scheduled' }, at)?.label, 'Now')
  assert.equal(statusTag({ ...slot, status: 'scheduled' }, Date.parse('2026-11-03T15:30:00Z')), null)
  assert.equal(statusTag({ ...slot, status: 'no-show' }, at)?.tone, 'red')
  assert.equal(statusTag({ ...slot, status: 'cancelled' }, at)?.label, 'Cancelled')
  assert.equal(isSoon('2026-11-04T20:00:00Z', at), true)
  assert.equal(isSoon('2026-11-05T20:00:00Z', at), false)
})

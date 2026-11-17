import test from 'node:test'
import assert from 'node:assert/strict'
import { dayLabel, relativeLabel, timeRange, timeZoneLabel, upcoming, whenLabel } from '../src/dashboard.ts'

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
test('next-appointment card says how far away the booking is in calendar days', () => {
  assert.equal(relativeLabel('2026-11-03T15:20:00Z', now), 'in 20 minutes')
  assert.equal(relativeLabel('2026-11-03T18:00:00Z', now), 'in 3 hours')
  assert.equal(relativeLabel('2026-11-04T13:00:00Z', now), 'tomorrow')
  assert.equal(relativeLabel('2026-11-05T13:00:00Z', now), 'in 2 days')
  // 10 p.m. local is still today even though it is a different UTC date.
  assert.equal(relativeLabel('2026-11-04T03:00:00Z', now), 'in 12 hours')
})
test('card time line shows weekday, date and time range, and the zone is named', () => {
  assert.match(whenLabel('2026-11-18T13:00:00Z', '2026-11-18T13:30:00Z'), /^Wed, Nov 18 · 8:00\s*–\s*8:30\s(AM|a\.m\.)$/)
  assert.equal(timeZoneLabel(), 'Eastern Time')
})
test('started appointments read as time ago, not hundreds of minutes', () => {
  assert.equal(relativeLabel('2026-11-03T14:40:00Z', now), '20 minutes ago')
  assert.equal(relativeLabel('2026-11-03T12:45:00Z', now), '2 hours ago')
  assert.equal(relativeLabel('2026-11-02T15:00:00Z', now), 'yesterday')
})
test('midnight-crossing slots stay short and other years show the year', () => {
  assert.match(timeRange('2026-11-22T04:30:00Z', '2026-11-22T05:00:00Z'), /^11:30\s(PM|p\.m\.) – 12:00\s(AM|a\.m\.)$/)
  assert.equal(dayLabel('2026-11-10T15:00:00Z', now), 'Tue, Nov 10')
  assert.equal(dayLabel('2025-11-10T15:00:00Z', now), 'Mon, Nov 10, 2025')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { upcoming } from '../src/dashboard.ts'

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

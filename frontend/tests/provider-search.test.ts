import test from 'node:test'
import assert from 'node:assert/strict'
import { filterProviders } from '../src/dashboard.ts'

const now = Date.parse('2026-11-03T15:00:00Z')
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

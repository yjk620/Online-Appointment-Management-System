import { useEffect, useState } from 'react'

type Account = { id: number; name: string; email: string; role: 'client' | 'provider' | 'admin'; provider_status: 'approved' | 'pending' | null }
const roleLabels = { client: 'Client', provider: 'Provider', admin: 'Admin' }

export default function AdminUsers({ refreshVersion }: { refreshVersion: number }) {
  const [users, setUsers] = useState<Account[]>([])
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ q: search, role })
        const response = await fetch(`/api/admin/users?${params}`, { cache: 'no-store', signal: controller.signal })
        if (response.status === 401) { window.location.replace('/login'); return }
        if (!response.ok) throw new Error('Could not load users. Please retry.')
        const result = (await response.json()) as { users: Account[] }
        if (!controller.signal.aborted) setUsers(result.users)
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load users.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    // Wait for a pause in typing so each keystroke doesn't send a request.
    const timer = window.setTimeout(() => void load(), 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [search, role, refreshVersion, retry])

  return <section className="admin-users" aria-labelledby="users-title">
    <h2 id="users-title">Users</h2>
    <div className="user-filters">
      <p><label htmlFor="user-search">Search by name or email</label>
        <input id="user-search" type="search" value={search} onChange={event => setSearch(event.target.value)} /></p>
      <p><label htmlFor="user-role">Role</label>
        <select id="user-role" value={role} onChange={event => setRole(event.target.value)}>
          <option value="">All roles</option>
          <option value="client">Clients</option>
          <option value="provider">Providers</option>
          <option value="admin">Admins</option>
        </select></p>
    </div>
    {error ? <><p role="alert">{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry users</button></>
      : loading && users.length === 0 ? <p role="status">Loading users...</p>
      : users.length === 0 ? <p>No users found.{search || role ? ' Try a different search or role.' : ''}</p>
      : <ul className="user-list" aria-busy={loading}>{users.map(user => <li key={user.id}>
          <div><strong>{user.name}</strong><span>{user.email}</span></div>
          <span className="user-role">{roleLabels[user.role]}{user.provider_status === 'pending' ? ' · pending' : user.provider_status === 'approved' ? ' · approved' : ''}</span>
        </li>)}</ul>}
    {(search || role) && <button type="button" className="secondary" onClick={() => { setSearch(''); setRole('') }}>Clear search</button>}
  </section>
}

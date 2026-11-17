import { useEffect, useState } from 'react'

type Account = { id: number; name: string; email: string; role: 'client' | 'provider' | 'admin'; provider_status: 'approved' | 'pending' | null }
const roleLabels = { client: 'Client', provider: 'Provider', admin: 'Admin' }
const pageSize = 10

export default function AdminUsers({ refreshVersion }: { refreshVersion: number }) {
  const [users, setUsers] = useState<Account[] | null>(null)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [shown, setShown] = useState(pageSize)
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
  // A new search starts from the first page again.
  useEffect(() => setShown(pageSize), [search, role])

  return <section className="side admin-users" aria-labelledby="users-title">
    <h2 id="users-title">Users{users ? ` (${users.length})` : ''}</h2>
    <div className="filter-row">
      <p><label htmlFor="user-search">Search name or email</label>
        <input id="user-search" type="search" value={search} onChange={event => setSearch(event.target.value)} /></p>
      <p><label htmlFor="user-role">Role</label>
        <select id="user-role" value={role} onChange={event => setRole(event.target.value)}>
          <option value="">All roles</option>
          <option value="client">Clients</option>
          <option value="provider">Providers</option>
          <option value="admin">Admins</option>
        </select></p>
      {(search || role) && <button type="button" className="link" onClick={() => { setSearch(''); setRole('') }}>Clear filters</button>}
    </div>
    {error ? <><p role="alert">{error}</p><button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>Retry</button></>
      : !users ? <p role="status">Loading users...</p>
      : users.length === 0 ? <p>No users match these filters.</p>
      : <>
        <ul className="user-list" aria-busy={loading}>{users.slice(0, shown).map(user => <li key={user.id}>
          <div><strong>{user.name}</strong><span>{user.email}</span></div>
          {user.provider_status === 'pending' ? <span className="tag amber">Pending</span>
            : <span className={`tag ${user.role === 'admin' ? 'dark' : 'grey'}`}>{roleLabels[user.role]}</span>}
        </li>)}</ul>
        {users.length > shown && <button type="button" className="link" onClick={() => setShown(value => value + pageSize)}>Show more ({users.length - shown})</button>}
      </>}
  </section>
}

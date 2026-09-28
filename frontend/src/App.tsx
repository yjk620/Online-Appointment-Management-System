import { FormEvent, useEffect, useState } from 'react'

type User = { id: number; name: string; email: string; role: 'client' | 'provider' | 'admin' }
const homes = { client: '/client', provider: '/provider', admin: '/admin' }
const authHeaders = { 'Content-Type': 'application/json', 'X-Requested-With': 'AppointmentDesk' }

export default function App() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [sessionError, setSessionError] = useState(false)
  const onLoginPage = window.location.pathname === '/login'
  const onDashboard = Object.values(homes).includes(window.location.pathname)

  useEffect(() => {
    async function restoreSession() {
      try {
        const response = await fetch('/api/session', { cache: 'no-store' })
        if (response.status === 401) {
          if (onDashboard) window.location.replace('/login')
          return
        }
        if (!response.ok) throw new Error('Session lookup failed')
        const result = (await response.json()) as { user: User }
        if (window.location.pathname !== homes[result.user.role]) {
          window.location.replace(homes[result.user.role])
          return
        }
        setUser(result.user)
      } catch {
        setSessionError(true)
      } finally {
        setCheckingSession(false)
      }
    }
    void restoreSession()
  }, [onDashboard])

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const response = await fetch('/api/login', {
        method: 'POST', headers: authHeaders, body: JSON.stringify({ email, password }),
      })
      const result = (await response.json()) as { user: User; error?: string }
      if (!response.ok) {
        setError(result.error ?? 'Sign in failed. Please try again.')
        return
      }
      window.location.replace(homes[result.user.role])
    } catch {
      setError('Could not connect to the server. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function logout() {
    setError('')
    setSubmitting(true)
    try {
      const response = await fetch('/api/logout', { method: 'POST', headers: authHeaders, body: '{}' })
      if (!response.ok) throw new Error('Sign out failed')
      window.location.replace('/login')
    } catch {
      setError('Could not sign out. Please try again.')
      setSubmitting(false)
    }
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(result.error ?? 'Registration failed. Please try again.')
        return
      }
      window.location.assign('/login?registered=1')
    } catch {
      setError('Could not connect to the server. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const justRegistered = new URLSearchParams(window.location.search).has('registered')

  return (
    <>
      <header><a href="/">Appointment Desk</a></header>
      <main>
        {checkingSession ? <p role="status">Checking your session…</p> : sessionError ? (
          <><p role="alert">Could not check your session. Please try again.</p><button onClick={() => window.location.reload()}>Retry</button></>
        ) : user ? (
          <>
            <h1>{user.role === 'admin' ? 'Admin' : user.role === 'provider' ? 'Provider' : 'Client'} home</h1>
            <p>Welcome, {user.name}.</p>
            <p>You are signed in as {user.email}.</p>
            <p>{user.role === 'client' ? 'Provider browsing and appointment booking are coming next.' : user.role === 'provider' ? 'Availability and appointment management are coming next.' : 'Account administration is coming next.'}</p>
            {error && <p role="alert">{error}</p>}
            <button disabled={submitting} onClick={() => void logout()}>{submitting ? 'Signing out…' : 'Sign out'}</button>
          </>
        ) : onDashboard ? <p role="status">Redirecting to sign in…</p> : onLoginPage ? (
          <>
            <h1>{justRegistered ? "You're all set." : 'Welcome back.'}</h1>
            <p>{justRegistered ? 'Your account is ready. Sign in to continue.' : 'Sign in to your account.'}</p>
            <form onSubmit={submitLogin}>
              <p><label htmlFor="email">Email address</label><br />
                <input id="email" name="email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></p>
              <p><label htmlFor="password">Password</label><br />
                <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></p>
              {error && <p role="alert">{error}</p>}
              <button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
            </form>
            <p>Need an account? <a href="/">Register</a></p>
          </>
        ) : (
          <>
            <h1>Create your account</h1>
            <p>Register to book appointments.</p>
            <form onSubmit={submitRegistration}>
              <p>
                <label htmlFor="name">Full name</label><br />
                <input id="name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
              </p>
              <p>
                <label htmlFor="email">Email address</label><br />
                <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </p>
              <p>
                <label htmlFor="password">Password</label><br />
                <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
              </p>
              {error && <p role="alert">{error}</p>}
              <button type="submit" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'}</button>
            </form>
            <p>Already have an account? <a href="/login">Sign in</a></p>
          </>
        )}
      </main>
    </>
  )
}

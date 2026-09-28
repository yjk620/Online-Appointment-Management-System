import { FormEvent, useState } from 'react'

export default function App() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  const onLoginPage = window.location.pathname === '/login'
  const justRegistered = new URLSearchParams(window.location.search).has('registered')

  return (
    <>
      <header><a href="/">Appointment Desk</a></header>
      <main>
        {onLoginPage ? (
          <>
            <h1>{justRegistered ? "You're all set." : 'Welcome back.'}</h1>
            <p>Sign in will be available in the next step of this project.</p>
            <a href="/">Back to registration</a>
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

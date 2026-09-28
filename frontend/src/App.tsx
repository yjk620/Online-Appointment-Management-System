import { useEffect, useState } from 'react'

type Health = { status: string; database: string }

export default function App() {
  const [message, setMessage] = useState('Checking API connection...')

  useEffect(() => {
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) throw new Error('API unavailable')
        return response.json() as Promise<Health>
      })
      .then((health) => {
        setMessage(
          health.status === 'ok' && health.database === 'ok'
            ? 'API and database connected'
            : 'API or database unavailable',
        )
      })
      .catch(() => setMessage('API unavailable. Start the Flask backend.'))
  }, [])

  return (
    <main>
      <h1>Online Appointment Management</h1>
      <p>Project setup is ready.</p>
      <p aria-live="polite">{message}</p>
    </main>
  )
}

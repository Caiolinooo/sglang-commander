import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setupAdmin } from '../api/endpoints'
import { useAuth } from '../contexts/AuthContext'

export default function SetupWizard() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '', server_port: 8080 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login: authLogin } = useAuth()

  const update = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleCreate = async () => {
    if (form.password !== form.confirm) {
      setError('Passwords do not match')
      return
    }
    setError('')
    setLoading(true)
    try {
      const resp = await setupAdmin({
        username: form.username,
        email: form.email,
        password: form.password,
        server_port: form.server_port,
      })
      const { access_token, refresh_token, user } = resp.data
      authLogin(user, access_token, refresh_token)
      navigate('/')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Setup failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="bg-surface p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-border">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">Welcome to SGLang Commander</h1>
          <p className="text-text-muted mt-1">Let's get your AI server management tool set up</p>
        </div>

        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`w-3 h-3 rounded-full ${step >= s ? 'bg-primary' : 'bg-surface-2'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Create Admin Account</h2>
            <div>
              <label className="block text-sm text-text-muted mb-1">Username</label>
              <input
                type="text" value={form.username}
                onChange={(e) => update('username', e.target.value)}
                className="w-full px-4 py-2.5 bg-bg border border-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="admin" required
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">Email</label>
              <input
                type="email" value={form.email}
                onChange={(e) => update('email', e.target.value)}
                className="w-full px-4 py-2.5 bg-bg border border-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="admin@example.com" required
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">Password (min 8 chars)</label>
              <input
                type="password" value={form.password}
                onChange={(e) => update('password', e.target.value)}
                className="w-full px-4 py-2.5 bg-bg border border-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">Confirm Password</label>
              <input
                type="password" value={form.confirm}
                onChange={(e) => update('confirm', e.target.value)}
                className="w-full px-4 py-2.5 bg-bg border border-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Server Configuration</h2>
            <div>
              <label className="block text-sm text-text-muted mb-1">Server Port</label>
              <input
                type="number" value={form.server_port}
                onChange={(e) => update('server_port', parseInt(e.target.value))}
                className="w-full px-4 py-2.5 bg-bg border border-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-text-muted mt-1">Port for the web management interface (default: 8080)</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Summary</h2>
            <div className="bg-bg rounded-lg p-4 space-y-2">
              <p><span className="text-text-muted">Username:</span> <span className="text-white">{form.username}</span></p>
              <p><span className="text-text-muted">Email:</span> <span className="text-white">{form.email}</span></p>
              <p><span className="text-text-muted">Server Port:</span> <span className="text-white">{form.server_port}</span></p>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
        )}

        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button onClick={() => setStep(step - 1)} className="px-6 py-2 border border-border rounded-lg text-text-muted hover:text-white hover:border-text-muted transition">
              Back
            </button>
          ) : <div />}
          {step < 3 ? (
            <button onClick={() => setStep(step + 1)} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition">
              Next
            </button>
          ) : (
            <button onClick={handleCreate} disabled={loading} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition disabled:opacity-50">
              {loading ? 'Creating...' : 'Finish Setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

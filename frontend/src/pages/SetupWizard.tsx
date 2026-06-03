import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setupAdmin } from '../api/endpoints'

export default function SetupWizard() {
  const [form, setForm] = useState({ username: 'admin', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      await setupAdmin({ username: form.username, email: form.email, password: form.password })
      navigate('/login')
    } catch {
      setError('Setup failed. Try again.')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg" style={{ backgroundImage: 'radial-gradient(ellipse at top, rgba(99,102,241,0.08) 0%, transparent 50%)' }}>
      <div className="glass rounded-2xl p-8 w-full max-w-md mx-4 animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-primary/30">{'\u2699'}</div>
          <h1 className="text-2xl font-bold gradient-text">Initial Setup</h1>
          <p className="text-text-muted text-sm mt-1">Create your admin account to get started</p>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-xl text-sm mb-4 animate-fade-in">{'\u26a0'} {error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Username</label>
            <input type="text" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Password</label>
            <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Confirm Password</label>
            <input type="password" value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition" required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary-hover hover:to-secondary text-white font-medium text-sm transition-all shadow-lg shadow-primary/20 disabled:opacity-50">
            {loading ? 'Setting up...' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  )
}

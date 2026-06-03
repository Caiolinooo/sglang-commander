import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api/endpoints'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login: authLogin } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const resp = await login(username, password)
      const d = resp.data
      authLogin(d.user || { username }, d.access_token, d.refresh_token)
      navigate('/')
    } catch {
      setError('Invalid username or password')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg" style={{ backgroundImage: 'radial-gradient(ellipse at top, rgba(99,102,241,0.08) 0%, transparent 50%)' }}>
      <div className="glass rounded-2xl p-8 w-full max-w-md mx-4 animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-primary/30">{'\u25b6'}</div>
          <h1 className="text-2xl font-bold gradient-text">SGLang Commander</h1>
          <p className="text-text-muted text-sm mt-1">Sign in to manage your inference server</p>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-xl text-sm mb-4 animate-fade-in">
            {'\u26a0'} {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition placeholder:text-text-muted"
              placeholder="Enter your username" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition placeholder:text-text-muted"
              placeholder="Enter your password" required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary-hover hover:to-secondary text-white font-medium text-sm transition-all shadow-lg shadow-primary/20 disabled:opacity-50">
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

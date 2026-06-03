import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api/endpoints'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Play, AlertTriangle, User, Lock } from 'lucide-react'

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
    <div className="min-h-screen flex items-center justify-center bg-bg px-4" style={{ backgroundImage: 'radial-gradient(ellipse at top, rgba(99,102,241,0.08) 0%, transparent 50%)' }}>
      <Card className="w-full max-w-md p-8 animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shadow-lg shadow-primary/30">
            <Play className="w-6 h-6 fill-current translate-x-[2px]" />
          </div>
          <h1 className="text-2xl font-bold gradient-text">SGLang Commander</h1>
          <p className="text-text-muted text-sm mt-1">Sign in to manage your inference server</p>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-xl text-sm mb-4 flex items-center gap-2 animate-fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Username</label>
            <Input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              icon={<User className="w-4 h-4" />}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Password</label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              icon={<Lock className="w-4 h-4" />}
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            size="lg"
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary-hover hover:to-secondary text-white font-medium text-sm transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </Button>
        </form>
      </Card>
    </div>
  )
}


import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setupAdmin, validateHFToken } from '../api/endpoints'

export default function SetupWizard() {
  const [step, setStep] = useState<'account' | 'hf'>('account')
  const [form, setForm] = useState({ username: 'admin', email: '', password: '', confirm: '', huggingface_token: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hfStatus, setHfStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [hfUser, setHfUser] = useState<{ name?: string; email?: string }>({})
  const navigate = useNavigate()

  const handleSubmitAccount = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setStep('hf')
  }

  const handleValidateHF = async () => {
    if (!form.huggingface_token.trim()) { setHfStatus('idle'); return }
    setHfStatus('checking')
    try {
      const r = await validateHFToken()
      if (r.data.valid) { setHfStatus('valid'); setHfUser({ name: r.data.name, email: r.data.email }) }
      else { setHfStatus('invalid') }
    } catch { setHfStatus('invalid') }
  }

  const handleFinalSubmit = async () => {
    setError('')
    setLoading(true)
    try {
      await setupAdmin({
        username: form.username,
        email: form.email,
        password: form.password,
        huggingface_token: form.huggingface_token || undefined,
      })
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
          <p className="text-text-muted text-sm mt-1">
            {step === 'account' ? 'Create your admin account' : 'Connect to HuggingFace'}
          </p>
          <div className="flex justify-center gap-2 mt-4">
            <div className={`h-1.5 w-12 rounded-full ${step === 'account' ? 'bg-primary' : 'bg-surface-3'}`} />
            <div className={`h-1.5 w-12 rounded-full ${step === 'hf' ? 'bg-primary' : 'bg-surface-3'}`} />
          </div>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-xl text-sm mb-4 animate-fade-in">{'\u26a0'} {error}</div>
        )}

        {step === 'account' && (
          <form onSubmit={handleSubmitAccount} className="space-y-4">
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
            <button type="submit"
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary-hover hover:to-secondary text-white font-medium text-sm transition-all shadow-lg shadow-primary/20">
              Next: HuggingFace Setup
            </button>
          </form>
        )}

        {step === 'hf' && (
          <div className="space-y-4">
            <div className="glass rounded-xl p-4 text-sm text-text-muted">
              <p className="font-medium text-text mb-1">Why do I need this?</p>
              <p>A HuggingFace token lets you download gated models (Llama, Mistral, etc.) and avoids rate limits.</p>
              <p className="mt-2">Get yours at <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener" className="text-primary hover:underline">huggingface.co/settings/tokens</a></p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">HuggingFace Token (optional)</label>
              <div className="flex gap-2">
                <input type="password" value={form.huggingface_token}
                  onChange={e => { setForm(p => ({ ...p, huggingface_token: e.target.value })); setHfStatus('idle') }}
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxx"
                  className="flex-1 px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition font-mono" />
                <button type="button" onClick={handleValidateHF} disabled={!form.huggingface_token.trim() || hfStatus === 'checking'}
                  className="px-4 py-2.5 rounded-xl glass text-sm font-medium hover:bg-surface-2 transition disabled:opacity-50">
                  {hfStatus === 'checking' ? '...' : 'Verify'}
                </button>
              </div>
              {hfStatus === 'valid' && (
                <p className="text-success text-xs mt-2 animate-fade-in">{'\u2713'} Connected as {hfUser.name || hfUser.email}</p>
              )}
              {hfStatus === 'invalid' && (
                <p className="text-danger text-xs mt-2 animate-fade-in">{'\u2717'} Invalid token</p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep('account')}
                className="flex-1 py-2.5 rounded-xl glass text-sm font-medium hover:bg-surface-2 transition">
                Back
              </button>
              <button onClick={handleFinalSubmit} disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary-hover hover:to-secondary text-white font-medium text-sm transition-all shadow-lg shadow-primary/20 disabled:opacity-50">
                {loading ? 'Setting up...' : (form.huggingface_token ? 'Save & Complete' : 'Skip for now')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

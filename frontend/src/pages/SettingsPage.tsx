import { useState, useEffect, useRef } from 'react'
import { getSettings, changePassword, checkUpdates, downloadUpdate, getUpdateStatus, applyUpdate, cancelUpdate } from '../api/endpoints'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState('')
  const [updateInfo, setUpdateInfo] = useState<{ update_available?: boolean; latest_version?: string; changelog?: string; current_version?: string; download_url?: string }>({})
  const [dlStatus, setDlStatus] = useState<{ status: string; progress: number; error?: string }>({ status: 'idle', progress: 0 })
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => { getSettings().then(r => setSettings(r.data)).catch(() => {}) }, [])

  const handlePwChange = async () => {
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg('Passwords do not match'); return }
    try { await changePassword(pwForm.current, pwForm.newPw); setPwMsg('Password changed!'); setPwForm({ current: '', newPw: '', confirm: '' }) } catch { setPwMsg('Failed') }
  }

  const handleCheckUpdates = async () => { try { const r = await checkUpdates(); setUpdateInfo(r.data) } catch {} }

  const handleDownload = async () => {
    if (!updateInfo.download_url) return
    try {
      await downloadUpdate(updateInfo.download_url)
      pollRef.current = setInterval(async () => {
        try { const s = await getUpdateStatus(); setDlStatus({ status: s.data.status, progress: s.data.progress, error: s.data.error }); if (['done', 'error'].includes(s.data.status) && pollRef.current) clearInterval(pollRef.current) } catch {}
      }, 1000)
    } catch {}
  }

  const handleApply = async () => { try { await applyUpdate() } catch {} }
  const handleCancel = async () => { try { await cancelUpdate() } catch {}; if (pollRef.current) clearInterval(pollRef.current); setDlStatus({ status: 'idle', progress: 0 }) }

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold gradient-text">Settings</h1>

      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Current Settings</h3>
        <div className="space-y-2 text-sm">
          {Object.entries(settings).map(([k, v]) => (
            <div key={k} className="flex justify-between py-1.5 border-b border-border/40 last:border-0">
              <span className="text-text-muted">{k.replace(/_/g, ' ')}</span>
              <span className="font-medium">{String(v)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Change Password</h3>
        <div className="space-y-3 max-w-md">
          <input type="password" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
            placeholder="Current password" className="w-full px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
          <input type="password" value={pwForm.newPw} onChange={e => setPwForm(p => ({ ...p, newPw: e.target.value }))}
            placeholder="New password" className="w-full px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
          <input type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
            placeholder="Confirm new password" className="w-full px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
          <button onClick={handlePwChange} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition shadow-lg shadow-primary/20">Change Password</button>
          {pwMsg && <p className={`text-sm ${pwMsg.includes('changed') ? 'text-success' : 'text-danger'}`}>{pwMsg}</p>}
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Updates</h3>
        <button onClick={handleCheckUpdates} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition shadow-lg shadow-primary/20">Check for Updates</button>
        {updateInfo.update_available && (
          <div className="mt-4 glass rounded-xl p-4 space-y-3 animate-fade-in">
            <p className="text-success font-medium">Update available: {String(updateInfo.latest_version)}</p>
            <p className="text-text-muted text-sm">{String(updateInfo.changelog || '').slice(0, 300)}</p>
            <div className="flex gap-2">
              <button onClick={handleDownload} disabled={dlStatus.status === 'downloading'} className="px-4 py-1.5 rounded-lg bg-success text-white text-xs disabled:opacity-50">Download</button>
              <button onClick={handleApply} disabled={dlStatus.status !== 'done'} className="px-4 py-1.5 rounded-lg bg-info text-white text-xs disabled:opacity-50">Apply</button>
              <button onClick={handleCancel} disabled={dlStatus.status !== 'downloading'} className="px-4 py-1.5 rounded-lg bg-danger text-white text-xs disabled:opacity-50">Cancel</button>
            </div>
            {dlStatus.status !== 'idle' && (
              <div>
                <p className="text-xs text-text-muted">Status: {dlStatus.status}</p>
                <div className="w-full h-1.5 rounded-full bg-bg mt-1 overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(dlStatus.progress, 100)}%` }} />
                </div>
                {dlStatus.error && <p className="text-xs text-danger mt-1">{dlStatus.error}</p>}
              </div>
            )}
          </div>
        )}
        {updateInfo.update_available === false && <p className="mt-3 text-text-muted text-sm">You're running the latest version.</p>}
      </div>
    </div>
  )
}

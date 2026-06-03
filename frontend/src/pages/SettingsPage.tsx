import { useState, useEffect, useRef } from 'react'
import { getSettings, changePassword, checkUpdates, downloadUpdate, getUpdateStatus, applyUpdate, cancelUpdate } from '../api/endpoints'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState('')
  const [updateInfo, setUpdateInfo] = useState<{ update_available?: boolean; latest_version?: string; changelog?: string; current_version?: string; download_url?: string }>({})
  const [dlStatus, setDlStatus] = useState<{ status: string; progress: number; error?: string }>({ status: 'idle', progress: 0 })
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => {
    getSettings().then(r => setSettings(r.data)).catch(() => {})
  }, [])

  const handlePwChange = async () => {
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg('Passwords do not match'); return }
    try {
      await changePassword(pwForm.current, pwForm.newPw)
      setPwMsg('Password changed!')
      setPwForm({ current: '', newPw: '', confirm: '' })
    } catch { setPwMsg('Failed to change password') }
  }

  const handleCheckUpdates = async () => {
    try {
      const r = await checkUpdates()
      setUpdateInfo(r.data)
    } catch {}
  }

  const handleDownload = async () => {
    if (!updateInfo.download_url) return
    try {
      await downloadUpdate(updateInfo.download_url)
      pollRef.current = setInterval(async () => {
        try {
          const s = await getUpdateStatus()
          setDlStatus({ status: s.data.status, progress: s.data.progress, error: s.data.error })
          if (s.data.status === 'done' || s.data.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current)
          }
        } catch {}
      }, 1000)
    } catch (e) { console.error(e) }
  }

  const handleApply = async () => {
    try { await applyUpdate() } catch {}
  }

  const handleCancelDl = async () => {
    try { await cancelUpdate() } catch {}
    if (pollRef.current) clearInterval(pollRef.current)
    setDlStatus({ status: 'idle', progress: 0 })
  }

  const bar = (pct: number) => (
    <div className="w-full bg-bg rounded-full h-2 mt-1">
      <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="bg-surface rounded-xl p-4 border border-border">
        <h3 className="font-medium mb-3">Current Settings</h3>
        <div className="space-y-2 text-sm">
          {Object.entries(settings).map(([k, v]) => (
            <div key={k} className="flex justify-between py-1 border-b border-border/50">
              <span className="text-text-muted">{k.replace(/_/g, ' ')}</span>
              <span className="text-white">{String(v)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface rounded-xl p-4 border border-border">
        <h3 className="font-medium mb-3">Change Password</h3>
        <div className="space-y-3 max-w-md">
          <input type="password" value={pwForm.current} onChange={(e) => setPwForm(p => ({ ...p, current: e.target.value }))}
            placeholder="Current password" className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm" />
          <input type="password" value={pwForm.newPw} onChange={(e) => setPwForm(p => ({ ...p, newPw: e.target.value }))}
            placeholder="New password" className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm" />
          <input type="password" value={pwForm.confirm} onChange={(e) => setPwForm(p => ({ ...p, confirm: e.target.value }))}
            placeholder="Confirm new password" className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm" />
          <button onClick={handlePwChange} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Change Password</button>
          {pwMsg && <p className={`text-sm ${pwMsg.includes('changed') ? 'text-green-400' : 'text-red-400'}`}>{pwMsg}</p>}
        </div>
      </div>

      <div className="bg-surface rounded-xl p-4 border border-border">
        <h3 className="font-medium mb-3">Updates</h3>
        <button onClick={handleCheckUpdates} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Check for Updates</button>
        {updateInfo.update_available && (
          <div className="mt-3 bg-green-500/10 border border-green-500/30 rounded p-3 text-sm space-y-2">
            <p className="text-green-400">Update available: {String(updateInfo.latest_version)}</p>
            <p className="text-text-muted mt-1">{String(updateInfo.changelog || '').slice(0, 300)}</p>
            <div className="flex gap-2">
              <button onClick={handleDownload} disabled={dlStatus.status === 'downloading'}
                className="px-3 py-1.5 bg-green-600 text-white rounded disabled:opacity-50">Download</button>
              <button onClick={handleApply} disabled={dlStatus.status !== 'done'}
                className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50">Apply Update</button>
              <button onClick={handleCancelDl} disabled={dlStatus.status !== 'downloading'}
                className="px-3 py-1.5 bg-red-600 text-white rounded disabled:opacity-50">Cancel</button>
            </div>
            {dlStatus.status !== 'idle' && (
              <div>
                <p className="text-xs text-text-muted">Status: {dlStatus.status}</p>
                {bar(dlStatus.progress)}
                {dlStatus.error && <p className="text-xs text-red-400 mt-1">{dlStatus.error}</p>}
              </div>
            )}
          </div>
        )}
        {updateInfo.update_available === false && (
          <p className="mt-3 text-text-muted text-sm">You're running the latest version.</p>
        )}
      </div>
    </div>
  )
}

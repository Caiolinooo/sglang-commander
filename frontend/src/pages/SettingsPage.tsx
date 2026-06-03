import { useState, useEffect, useRef } from 'react'
import { getSettings, changePassword, checkUpdates, downloadUpdate, getUpdateStatus, applyUpdate, cancelUpdate } from '../api/endpoints'
import { Settings, Lock, RefreshCw, Download, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState<{ text: string, type: 'success' | 'error' | '' }>({ text: '', type: '' })
  const [updateInfo, setUpdateInfo] = useState<{ update_available?: boolean; latest_version?: string; changelog?: string; current_version?: string; download_url?: string }>({})
  const [dlStatus, setDlStatus] = useState<{ status: string; progress: number; error?: string }>({ status: 'idle', progress: 0 })
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => { getSettings().then(r => setSettings(r.data)).catch(() => {}) }, [])

  const handlePwChange = async () => {
    if (!pwForm.current || !pwForm.newPw || !pwForm.confirm) {
      setPwMsg({ text: 'All fields are required', type: 'error' }); return
    }
    if (pwForm.newPw !== pwForm.confirm) { 
      setPwMsg({ text: 'Passwords do not match', type: 'error' }); return 
    }
    try { 
      await changePassword(pwForm.current, pwForm.newPw); 
      setPwMsg({ text: 'Password changed successfully!', type: 'success' }); 
      setPwForm({ current: '', newPw: '', confirm: '' }) 
      setTimeout(() => setPwMsg({ text: '', type: '' }), 3000)
    } catch { 
      setPwMsg({ text: 'Failed to change password. Check your current password.', type: 'error' }) 
    }
  }

  const handleCheckUpdates = async () => { 
    try { const r = await checkUpdates(); setUpdateInfo(r.data) } catch {} 
  }

  const handleDownload = async () => {
    if (!updateInfo.download_url) return
    try {
      await downloadUpdate(updateInfo.download_url)
      pollRef.current = setInterval(async () => {
        try { 
          const s = await getUpdateStatus()
          setDlStatus({ status: s.data.status, progress: s.data.progress, error: s.data.error })
          if (['done', 'error'].includes(s.data.status) && pollRef.current) clearInterval(pollRef.current) 
        } catch {}
      }, 1000)
    } catch {}
  }

  const handleApply = async () => { try { await applyUpdate() } catch {} }
  const handleCancel = async () => { try { await cancelUpdate() } catch {}; if (pollRef.current) clearInterval(pollRef.current); setDlStatus({ status: 'idle', progress: 0 }) }

  return (
    <div className="p-8 space-y-6 animate-in max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text">Settings</h1>
        <p className="text-text-muted mt-1">Manage application configuration and updates</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            <CardTitle>Current Configuration</CardTitle>
          </div>
          <CardDescription>System parameters and current settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-surface-2 rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-2 p-3 bg-surface border-b border-border">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Parameter</span>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Value</span>
            </div>
            {Object.entries(settings).length > 0 ? (
              <div className="divide-y divide-border">
                {Object.entries(settings).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-2 p-3 hover:bg-surface transition-colors">
                    <span className="text-sm text-text-muted font-medium">{k.replace(/_/g, ' ')}</span>
                    <span className="text-sm font-mono text-text break-all">{String(v)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-sm text-text-muted text-center">Loading settings...</div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              <CardTitle>Security</CardTitle>
            </div>
            <CardDescription>Update your remote access password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-text-muted mb-1.5 block">Current Password</label>
                <Input 
                  type="password" 
                  value={pwForm.current} 
                  onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                  placeholder="Enter current password" 
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted mb-1.5 block">New Password</label>
                <Input 
                  type="password" 
                  value={pwForm.newPw} 
                  onChange={e => setPwForm(p => ({ ...p, newPw: e.target.value }))}
                  placeholder="Enter new password" 
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted mb-1.5 block">Confirm New Password</label>
                <Input 
                  type="password" 
                  value={pwForm.confirm} 
                  onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                  placeholder="Confirm new password" 
                />
              </div>
            </div>
            
            {pwMsg.text && (
              <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${pwMsg.type === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                {pwMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {pwMsg.text}
              </div>
            )}
            
            <Button onClick={handlePwChange} className="w-full">
              Update Password
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              <CardTitle>Updates</CardTitle>
            </div>
            <CardDescription>Check for and install software updates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleCheckUpdates} variant="outline" className="w-full gap-2">
              <Search className="w-4 h-4" /> Check for Updates
            </Button>
            
            {updateInfo.update_available !== undefined && !updateInfo.update_available && (
              <div className="text-center py-6 bg-surface-2 rounded-xl border border-dashed border-border">
                <CheckCircle className="w-8 h-8 text-success mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium text-text">Up to date</p>
                <p className="text-xs text-text-muted mt-1">You are running the latest version.</p>
              </div>
            )}

            {updateInfo.update_available && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-4 animate-in slide-in-from-bottom-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-primary">New version available!</p>
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/30">v{String(updateInfo.latest_version)}</Badge>
                  </div>
                  <p className="text-xs text-text-muted line-clamp-3">{String(updateInfo.changelog || 'No changelog provided.')}</p>
                </div>
                
                {dlStatus.status === 'idle' && (
                  <Button onClick={handleDownload} className="w-full gap-2" size="sm">
                    <Download className="w-4 h-4" /> Download Update
                  </Button>
                )}

                {dlStatus.status !== 'idle' && (
                  <div className="space-y-3 bg-bg rounded-lg p-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-muted font-medium capitalize">{dlStatus.status}</span>
                      <span className="text-text font-mono">{Math.round(dlStatus.progress)}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.min(dlStatus.progress, 100)}%` }} />
                    </div>
                    {dlStatus.error && <p className="text-xs text-danger flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {dlStatus.error}</p>}
                    
                    <div className="flex gap-2 pt-2">
                      <Button 
                        size="sm" 
                        variant="danger" 
                        onClick={handleCancel} 
                        disabled={dlStatus.status !== 'downloading'} 
                        className="flex-1 h-8 text-xs"
                      >
                        <XCircle className="w-3 h-3 mr-1" /> Cancel
                      </Button>
                      <Button 
                        size="sm" 
                        variant="primary" 
                        onClick={handleApply} 
                        disabled={dlStatus.status !== 'done'} 
                        className="flex-1 h-8 text-xs bg-success hover:bg-success/90 text-white"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" /> Install Now
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
import { Search } from 'lucide-react'


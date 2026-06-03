import { useState, useEffect } from 'react'
import { getZTStatus, joinZTNetwork, leaveZTNetwork, createApiKey, listApiKeys } from '../api/endpoints'
import { Network, Key, Plus, Trash2, Globe, Activity, Copy, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'

export default function DeployPage() {
  const [zt, setZt] = useState<{ installed: boolean; running: boolean; node_id?: string; online: boolean; networks: Array<{ network_id: string; name: string; status: string; assigned_ips: string[] }> }>({ installed: false, running: false, online: false, networks: [] })
  const [netId, setNetId] = useState('')
  const [keyName, setKeyName] = useState('')
  const [keys, setKeys] = useState<Array<{ id: number; name: string; key: string; scopes: string }>>([])
  const [newKey, setNewKey] = useState('')
  const [copiedKey, setCopiedKey] = useState(false)

  useEffect(() => { refresh() }, [])

  const refresh = async () => { try { const [z, k] = await Promise.all([getZTStatus(), listApiKeys()]); setZt(z.data); setKeys(k.data || []) } catch {} }

  const handleJoin = async () => { if (!netId.trim()) return; try { await joinZTNetwork(netId); setNetId(''); refresh() } catch {} }
  const handleLeave = async (id: string) => { try { await leaveZTNetwork(id); refresh() } catch {} }

  const handleCreateKey = async () => { if (!keyName.trim()) return; try { const r = await createApiKey(keyName); setNewKey(r.data.key || ''); setKeyName(''); refresh() } catch {} }

  const handleCopyKey = () => {
    if (!newKey) return
    navigator.clipboard.writeText(newKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  return (
    <div className="p-8 space-y-6 animate-in max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text">Deploy & Remote Access</h1>
        <p className="text-text-muted mt-1">Manage ZeroTier networks and API keys for remote access</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5 text-primary" />
                <CardTitle>ZeroTier Network</CardTitle>
              </div>
              <Badge variant={zt.online ? 'success' : 'danger'} className="flex items-center gap-1.5">
                <Activity className="w-3 h-3" />
                {zt.online ? 'Online' : 'Offline'}
              </Badge>
            </div>
            <CardDescription>
              Connect to virtual networks for secure remote access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-surface-2 rounded-xl p-4 border border-border flex justify-between items-center">
              <div>
                <p className="text-xs text-text-muted font-medium mb-1">Node ID</p>
                <p className="font-mono text-sm">{zt.node_id || 'N/A'}</p>
              </div>
              <Globe className="w-8 h-8 text-text-muted opacity-50" />
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-text flex items-center gap-2">
                Active Networks <Badge variant="default">{zt.networks.length}</Badge>
              </h4>
              
              {zt.networks.length === 0 ? (
                <div className="text-center py-6 bg-surface-2 rounded-xl border border-dashed border-border">
                  <p className="text-sm text-text-muted">Not connected to any networks</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {zt.networks.map(n => (
                    <div key={n.network_id} className="bg-surface border border-border rounded-xl p-3 flex items-center justify-between group">
                      <div>
                        <p className="text-sm font-medium text-text">{n.name || n.network_id}</p>
                        <p className="text-xs text-text-muted mt-0.5 font-mono">{n.assigned_ips.join(', ') || 'No IP assigned'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={n.status === 'OK' ? 'success' : 'warning'} className="text-[10px]">
                          {n.status}
                        </Badge>
                        <Button variant="ghost" size="icon" onClick={() => handleLeave(n.network_id)} className="h-8 w-8 text-danger hover:bg-danger/10 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-sm font-medium text-text mb-2">Join Network</p>
              <div className="flex gap-2">
                <Input 
                  value={netId} 
                  onChange={e => setNetId(e.target.value)} 
                  placeholder="Enter Network ID (16 chars)"
                  className="flex-1 font-mono text-sm"
                />
                <Button onClick={handleJoin} disabled={!netId.trim()} className="gap-2 shrink-0">
                  <Plus className="w-4 h-4" /> Join
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              <CardTitle>API Keys</CardTitle>
            </div>
            <CardDescription>
              Manage authentication keys for API access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-text flex items-center gap-2">
                Active Keys <Badge variant="default">{keys.length}</Badge>
              </h4>
              
              {keys.length === 0 ? (
                <div className="text-center py-6 bg-surface-2 rounded-xl border border-dashed border-border">
                  <p className="text-sm text-text-muted">No API keys created</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {keys.map(k => (
                    <div key={k.id} className="flex items-center justify-between bg-surface border border-border rounded-xl p-3">
                      <div className="min-w-0 pr-4">
                        <p className="text-sm font-medium text-text truncate">{k.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-text-muted font-mono truncate">{k.key.slice(0, 8)}...{k.key.slice(-4)}</p>
                          <span className="text-[10px] bg-surface-2 px-1.5 py-0.5 rounded text-text-muted">{k.scopes}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-sm font-medium text-text mb-2">Create New Key</p>
              <div className="flex gap-2">
                <Input 
                  value={keyName} 
                  onChange={e => setKeyName(e.target.value)} 
                  placeholder="e.g., Python Script, Web App"
                  className="flex-1 text-sm"
                />
                <Button onClick={handleCreateKey} disabled={!keyName.trim()} className="gap-2 shrink-0 bg-secondary hover:bg-secondary-hover text-white">
                  <Plus className="w-4 h-4" /> Create
                </Button>
              </div>
              
              {newKey && (
                <div className="mt-4 bg-success/10 border border-success/20 rounded-xl p-4 animate-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-success font-medium flex items-center gap-1.5">
                      <Check className="w-4 h-4" /> New API Key Created
                    </p>
                    <Badge variant="outline" className="text-[10px] text-success border-success/30">Save this now!</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono break-all bg-bg/50 p-2.5 rounded-lg flex-1 border border-success/20 select-all">{newKey}</p>
                    <Button variant="outline" size="icon" onClick={handleCopyKey} className="shrink-0 h-9 w-9 border-success/30 text-success hover:bg-success/20">
                      {copiedKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-success/80 mt-2">You won't be able to see this key again.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


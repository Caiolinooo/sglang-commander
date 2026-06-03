import { useState, useEffect } from 'react'
import { getZTStatus, joinZTNetwork, leaveZTNetwork, createApiKey, listApiKeys } from '../api/endpoints'

export default function DeployPage() {
  const [zt, setZt] = useState<{ installed: boolean; running: boolean; node_id?: string; online: boolean; networks: Array<{ network_id: string; name: string; status: string; assigned_ips: string[] }> }>({ installed: false, running: false, online: false, networks: [] })
  const [netId, setNetId] = useState('')
  const [keyName, setKeyName] = useState('')
  const [keys, setKeys] = useState<Array<{ id: number; name: string; key: string; scopes: string }>>([])
  const [newKey, setNewKey] = useState('')

  useEffect(() => { refresh() }, [])

  const refresh = async () => { try { const [z, k] = await Promise.all([getZTStatus(), listApiKeys()]); setZt(z.data); setKeys(k.data || []) } catch {} }

  const handleJoin = async () => { if (!netId.trim()) return; try { await joinZTNetwork(netId); setNetId(''); refresh() } catch {} }
  const handleLeave = async (id: string) => { try { await leaveZTNetwork(id); refresh() } catch {} }

  const handleCreateKey = async () => { if (!keyName.trim()) return; try { const r = await createApiKey(keyName); setNewKey(r.data.key || ''); setKeyName(''); refresh() } catch {} }

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold gradient-text">Deploy & Remote Access</h1>

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">ZeroTier Status</h3>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${zt.online ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
            {zt.online ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="space-y-2 text-sm">
          <p><span className="text-text-muted">Node ID:</span> {zt.node_id || 'N/A'}</p>
          <p><span className="text-text-muted">Networks:</span> {zt.networks.length}</p>
          {zt.networks.map(n => (
            <div key={n.network_id} className="glass rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">{n.name || n.network_id}</p>
                <p className="text-[10px] text-text-muted">{n.assigned_ips.join(', ') || 'No IP'}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded ${n.status === 'OK' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>{n.status}</span>
              <button onClick={() => handleLeave(n.network_id)} className="text-[10px] text-danger hover:underline">Leave</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input value={netId} onChange={e => setNetId(e.target.value)} placeholder="Network ID"
            className="flex-1 px-3 py-2 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
          <button onClick={handleJoin} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition">Join</button>
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">API Keys</h3>
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.id} className="flex items-center justify-between glass rounded-xl p-3">
              <div>
                <p className="text-xs font-medium">{k.name}</p>
                <p className="text-[10px] text-text-muted font-mono">{k.key.slice(0, 20)}... | {k.scopes}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="Key name"
            className="flex-1 px-3 py-2 rounded-lg bg-bg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
          <button onClick={handleCreateKey} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition">Create</button>
        </div>
        {newKey && (
          <div className="mt-3 glass rounded-xl p-3 animate-fade-in">
            <p className="text-xs text-success font-medium">New API Key (copy now):</p>
            <p className="text-xs font-mono mt-1 break-all bg-bg p-2 rounded">{newKey}</p>
          </div>
        )}
      </div>
    </div>
  )
}

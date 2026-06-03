import { useState, useEffect } from 'react'
import { getZTStatus, joinZTNetwork, leaveZTNetwork, createApiKey, listApiKeys } from '../api/endpoints'

export default function DeployPage() {
  const [zt, setZt] = useState<{ installed: boolean; running: boolean; node_id?: string; online: boolean; networks: Array<{ network_id: string; name: string; status: string; assigned_ips: string[] }> }>({ installed: false, running: false, online: false, networks: [] })
  const [netId, setNetId] = useState('')
  const [keyName, setKeyName] = useState('')
  const [keys, setKeys] = useState<Array<{ id: number; name: string; key: string; scopes: string }>>([])
  const [newKey, setNewKey] = useState('')

  useEffect(() => { refresh() }, [])

  const refresh = async () => {
    try {
      const [z, k] = await Promise.all([getZTStatus(), listApiKeys()])
      setZt(z.data)
      setKeys(k.data || [])
    } catch {} }

  const handleJoin = async () => {
    if (!netId) return
    try { await joinZTNetwork(netId); refresh() } catch {}
  }
  const handleLeave = async () => {
    if (!netId) return
    try { await leaveZTNetwork(netId); refresh() } catch {}
  }
  const handleCreateKey = async () => {
    if (!keyName) return
    try {
      const resp = await createApiKey(keyName)
      setNewKey(resp.data.key)
      setKeyName('')
      refresh()
    } catch {}
  }

  const connStr = `# SGLang Commander - Remote Connection\nServer: ${zt.networks[0]?.assigned_ips[0] || 'your-zt-ip'}:8080\n\ncurl http://${zt.networks[0]?.assigned_ips[0] || 'your-zt-ip'}:8080/api/v1/server/status`

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Deploy & Remote Access</h1>

      <div className="bg-surface rounded-xl p-4 border border-border">
        <h3 className="font-medium mb-3">ZeroTier Network</h3>
        <div className="flex items-center gap-2 mb-3">
          <span className={`w-3 h-3 rounded-full ${zt.online ? 'bg-green-500' : zt.installed ? 'bg-yellow-500' : 'bg-red-500'}`} />
          <span className="text-sm">{zt.online ? `Connected (${zt.node_id})` : zt.installed ? 'Not connected' : 'Not installed'}</span>
        </div>
        {zt.networks.map((n, i) => (
          <div key={i} className="text-sm text-text-muted bg-bg rounded p-2 mb-2">
            <p>{n.network_id} - {n.name} - {n.status}</p>
            <p>IPs: {n.assigned_ips.join(', ') || 'N/A'}</p>
          </div>
        ))}
        <div className="flex gap-2 mt-3">
          <input value={netId} onChange={(e) => setNetId(e.target.value)} placeholder="Network ID"
            className="flex-1 px-3 py-1.5 bg-bg border border-border rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <button onClick={handleJoin} className="px-3 py-1.5 bg-primary text-white rounded text-sm">Join</button>
          <button onClick={handleLeave} className="px-3 py-1.5 bg-red-600 text-white rounded text-sm">Leave</button>
        </div>
      </div>

      <div className="bg-surface rounded-xl p-4 border border-border">
        <h3 className="font-medium mb-3">Connection Info</h3>
        <pre className="bg-bg rounded p-3 text-sm text-green-400 font-mono overflow-x-auto">{connStr}</pre>
      </div>

      <div className="bg-surface rounded-xl p-4 border border-border">
        <h3 className="font-medium mb-3">API Keys</h3>
        <div className="flex gap-2 mb-3">
          <input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name"
            className="flex-1 px-3 py-1.5 bg-bg border border-border rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <button onClick={handleCreateKey} className="px-3 py-1.5 bg-primary text-white rounded text-sm">Create</button>
        </div>
        {newKey && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 mb-3">
            <p className="text-yellow-400 text-sm font-bold">Save this key!</p>
            <code className="text-yellow-300 text-xs break-all">{newKey}</code>
          </div>
        )}
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between py-1.5 border-b border-border/50 text-sm">
            <span className="text-white">{k.name}</span>
            <span className="text-text-muted">{k.scopes} - {k.key.slice(0, 16)}...</span>
          </div>
        ))}
      </div>
    </div>
  )
}

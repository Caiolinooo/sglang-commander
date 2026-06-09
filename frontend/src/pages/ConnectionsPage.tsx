import { useState, useEffect } from 'react'
import { useConnectionsStore } from '../stores'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { cn } from '../components/ui/cn'
import { Server, Plus, Trash2, ShieldCheck } from 'lucide-react'
import { toast } from '../components/ui/Toast'

export default function ConnectionsPage() {
  const {
    connections,
    activeConnectionId,
    loadConnections,
    addConnection,
    deleteConnection,
    setActiveConnection,
    testConnection
  } = useConnectionsStore()

  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({
    name: '',
    host: '',
    port: 22,
    username: 'root',
    authType: 'password' as 'password' | 'key',
    password: '',
    privateKey: ''
  })

  useEffect(() => {
    loadConnections()
  }, [])

  const handleSave = () => {
    if (!form.name || !form.host || !form.username) {
      toast.warning("Please fill in Name, Host, and Username fields.")
      return
    }
    addConnection(form)
    setShowAddForm(false)
    setForm({
      name: '',
      host: '',
      port: 22,
      username: 'root',
      authType: 'password',
      password: '',
      privateKey: ''
    })
    toast.success("Remote connection profile added successfully.")
  }

  const handleTest = async (id: string) => {
    const success = await testConnection(id)
    if (success) {
      toast.success("Successfully connected to SSH remote host!")
    } else {
      toast.error("Failed to authenticate with SSH remote host.")
    }
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text">Remote SSH Connections</h1>
          <p className="text-text-muted mt-1">Configure remote SSH host profiles to execute SGLang runtimes remotely</p>
        </div>
        <Button onClick={() => setShowAddForm(true)} className="gap-2 font-bold">
          <Plus size={16} /> Add Remote Profile
        </Button>
      </div>

      {showAddForm && (
        <Card className="animate-in slide-in-from-top-4">
          <CardContent className="p-6 space-y-4">
            <h3 className="font-bold text-text text-base border-b border-border pb-2">New SSH Connection Profile</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-text-muted mb-1.5 block">Profile Name</label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Lambda Labs GPU Node" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-muted mb-1.5 block">Host (IP or Domain)</label>
                <Input value={form.host} onChange={e => setForm(p => ({ ...p, host: e.target.value }))} placeholder="192.168.1.15" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-muted mb-1.5 block">Port</label>
                <Input type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: Number(e.target.value) }))} placeholder="22" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-muted mb-1.5 block">Username</label>
                <Input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder="root" />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-xs font-semibold text-text-muted block">Authentication Mode</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs text-text font-semibold cursor-pointer">
                  <input 
                    type="radio" 
                    checked={form.authType === 'password'} 
                    onChange={() => setForm(p => ({ ...p, authType: 'password' }))}
                    className="w-4 h-4 text-primary bg-surface border-border focus:ring-primary" 
                  />
                  Password Auths
                </label>
                <label className="flex items-center gap-2 text-xs text-text font-semibold cursor-pointer">
                  <input 
                    type="radio" 
                    checked={form.authType === 'key'} 
                    onChange={() => setForm(p => ({ ...p, authType: 'key' }))}
                    className="w-4 h-4 text-primary bg-surface border-border focus:ring-primary" 
                  />
                  SSH Private Key
                </label>
              </div>
            </div>

            {form.authType === 'password' ? (
              <div>
                <label className="text-xs font-semibold text-text-muted mb-1.5 block">Password</label>
                <Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold text-text-muted mb-1.5 block">Private Key Content</label>
                <textarea 
                  value={form.privateKey} 
                  onChange={e => setForm(p => ({ ...p, privateKey: e.target.value }))} 
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                  className="w-full h-24 p-3 rounded-lg bg-surface-2 border border-border text-xs text-text focus:outline-none focus:border-primary resize-none font-mono"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
              <Button variant="secondary" onClick={() => setShowAddForm(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save Host Connection</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4">
        {connections.map((c) => {
          const isActive = activeConnectionId === c.id
          
          return (
            <Card key={c.id} className={cn("overflow-hidden hover:border-border-hover transition-all duration-300", isActive ? "border-primary/50 ring-1 ring-primary/20 shadow-md" : "")}>
              <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", isActive ? "bg-primary/10 text-primary" : "bg-surface-2 text-text-muted")}>
                    <Server size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-text text-sm">{c.name}</span>
                      {isActive && <Badge variant="default" className="text-[9px] py-0 uppercase">Active Host</Badge>}
                      {c.status && (
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[9px] py-0 uppercase tracking-wide",
                            c.status === 'connected' ? "bg-success/5 border-success/30 text-success" :
                            c.status === 'connecting' ? "bg-primary/5 border-primary/30 text-primary animate-pulse" :
                            c.status === 'error' ? "bg-danger/5 border-danger/30 text-danger" : "text-text-muted"
                          )}
                        >
                          {c.status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-1 font-mono">
                      {c.username}@{c.host}:{c.port}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    variant={isActive ? 'secondary' : 'outline'} 
                    size="sm" 
                    onClick={() => setActiveConnection(isActive ? null : c.id)}
                    className="h-8 font-semibold text-xs"
                  >
                    {isActive ? 'Disconnect' : 'Set Active'}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleTest(c.id)}
                    className="h-8 font-semibold text-xs text-success border-success/30 hover:bg-success/5"
                  >
                    Test Link
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => deleteConnection(c.id)}
                    className="h-8 w-8 text-danger hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {connections.length === 0 && !showAddForm && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <ShieldCheck className="h-10 w-10 text-text-muted opacity-40 mb-3" />
              <h3 className="text-sm font-bold text-text">No remote hosts configured</h3>
              <p className="text-xs text-text-muted mt-1 max-w-sm mb-5">By default, the commander targets localhost (127.0.0.1). Add remote host profiles to run on host GPUs over SSH tunnel.</p>
              <Button onClick={() => setShowAddForm(true)} className="gap-2 font-bold text-xs h-9">
                <Plus size={14} /> Add First SSH Profile
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

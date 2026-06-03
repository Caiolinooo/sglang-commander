import { useState, useEffect } from 'react'
import { listServerProfiles, createServerProfile, updateServerProfile, deleteServerProfile, activateServerProfile } from '../api/endpoints'
import type { ServerProfile } from '../types'
import { Server, Plus, Trash2, Edit2, CheckCircle2, Globe, ClipboardList, Check } from 'lucide-react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { cn } from '../components/ui/Button'

export default function ServerProfilesPage() {
  const [profiles, setProfiles] = useState<ServerProfile[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ServerProfile | null>(null)
  const [form, setForm] = useState({ name: '', model_path: '', host: '127.0.0.1', port: 30000, args_json: '{}', is_remote: false, remote_url: '' })

  useEffect(() => { fetchProfiles() }, [])

  const fetchProfiles = async () => { try { const r = await listServerProfiles(); setProfiles(r.data) } catch {} }

  const resetForm = () => { setForm({ name: '', model_path: '', host: '127.0.0.1', port: 30000, args_json: '{}', is_remote: false, remote_url: '' }); setEditing(null); setShowForm(false) }

  const handleSave = async () => {
    try { if (editing) { await updateServerProfile(editing.id, form) } else { await createServerProfile(form) }; resetForm(); await fetchProfiles() } catch {}
  }

  const handleEdit = (p: ServerProfile) => { setForm({ name: p.name, model_path: p.model_path, host: p.host, port: p.port, args_json: p.args_json, is_remote: p.is_remote, remote_url: p.remote_url || '' }); setEditing(p); setShowForm(true) }

  const handleDelete = async (id: number) => { try { await deleteServerProfile(id); await fetchProfiles() } catch {} }
  const handleActivate = async (id: number) => { try { await activateServerProfile(id); await fetchProfiles() } catch {} }

  return (
    <div className="p-8 space-y-6 animate-in max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text">Server Profiles</h1>
          <p className="text-text-muted mt-1">Save and manage server configurations</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true) }} className="gap-2">
          <Plus className="w-4 h-4" /> New Profile
        </Button>
      </div>

      {showForm && (
        <Card className="animate-in slide-in-from-top-4">
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold text-text text-lg border-b border-border pb-2">
              {editing ? 'Edit Profile' : 'New Profile'}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-text-muted mb-1.5 block">Profile Name</label>
                <Input value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Llama-3 Local" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted mb-1.5 block">Model Path (HF or local)</label>
                <Input value={form.model_path} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, model_path: e.target.value }))} placeholder="meta-llama/Llama-3.2-3B-Instruct" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted mb-1.5 block">Host</label>
                <Input value={form.host} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, host: e.target.value }))} placeholder="127.0.0.1" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted mb-1.5 block">Port</label>
                <Input type="number" value={form.port} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, port: Number(e.target.value) }))} placeholder="30000" />
              </div>
            </div>
            
            <div className="pt-2">
              <label className="flex items-center gap-2 text-sm text-text font-medium cursor-pointer w-fit">
                <input 
                  type="checkbox" 
                  checked={form.is_remote} 
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, is_remote: e.target.checked }))} 
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50 bg-surface" 
                /> 
                Remote Server
              </label>
            </div>
            
            {form.is_remote && (
              <div className="animate-in fade-in zoom-in-95">
                <label className="text-xs font-medium text-text-muted mb-1.5 block">Remote URL</label>
                <Input value={form.remote_url} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, remote_url: e.target.value }))} placeholder="https://api.example.com" />
              </div>
            )}
            
            <div className="flex gap-3 pt-4 justify-end border-t border-border mt-2">
              <Button variant="secondary" onClick={resetForm}>Cancel</Button>
              <Button onClick={handleSave} disabled={!form.name || !form.model_path} className="gap-2">
                <Check className="w-4 h-4" /> Save Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4">
        {profiles.map(p => (
          <Card key={p.id} className={cn("overflow-hidden transition-all duration-300", p.is_active ? "border-primary/50 ring-1 ring-primary/20 shadow-md" : "hover:border-border-hover")}>
            <CardContent className="p-0">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 gap-4">
                <div className="flex items-start gap-4">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", p.is_active ? "bg-primary/10 text-primary" : "bg-surface-2 text-text-muted")}>
                    <Server size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-text">{p.name}</span>
                      {p.is_active && <Badge variant="default" className="text-[10px] uppercase tracking-wide gap-1 bg-primary text-white border-transparent"><CheckCircle2 className="w-3 h-3" /> Active</Badge>}
                      {p.is_remote && <Badge variant="default" className="text-[10px] uppercase tracking-wide gap-1 text-info bg-info/10 border-info/20"><Globe className="w-3 h-3" /> Remote</Badge>}
                    </div>
                    <p className="text-sm text-text-muted mt-1 font-mono">
                      <span className="text-text">{p.model_path}</span>
                      <span className="mx-2 text-border">•</span>
                      {p.host}:{p.port}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                  <Button 
                    variant={p.is_active ? 'secondary' : 'outline'} 
                    size="sm" 
                    onClick={() => handleActivate(p.id)} 
                    disabled={p.is_active} 
                    className={cn("flex-1 sm:flex-none gap-2", p.is_active ? "opacity-50 cursor-not-allowed" : "text-success border-success/30 hover:bg-success/10")}
                  >
                    <CheckCircle2 className="w-4 h-4" /> {p.is_active ? 'Active' : 'Set Active'}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(p)} className="h-9 w-9 text-text-muted hover:text-text">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} className="h-9 w-9 text-danger hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {profiles.length === 0 && !showForm && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-surface-2 flex items-center justify-center mb-4">
                <ClipboardList className="h-8 w-8 text-text-muted opacity-50" />
              </div>
              <h3 className="text-lg font-semibold text-text">No profiles yet</h3>
              <p className="text-sm text-text-muted mt-1 max-w-sm mb-6">Create a profile to easily switch between different server configurations and models.</p>
              <Button onClick={() => setShowForm(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Create First Profile
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

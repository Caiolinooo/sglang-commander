import { useState, useEffect } from 'react'
import { listServerProfiles, createServerProfile, updateServerProfile, deleteServerProfile, activateServerProfile } from '../api/endpoints'
import type { ServerProfile } from '../types'

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
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Server Profiles</h1>
          <p className="text-text-muted text-sm mt-0.5">Save and manage server configurations</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-white text-sm font-medium transition-all shadow-lg shadow-primary/20">+ New Profile</button>
      </div>

      {showForm && (
        <div className="glass rounded-2xl p-5 space-y-3 animate-fade-in">
          <h3 className="font-medium">{editing ? 'Edit Profile' : 'New Profile'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Profile name"
              className="px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
            <input value={form.model_path} onChange={e => setForm(p => ({ ...p, model_path: e.target.value }))} placeholder="Model path (HF or local)"
              className="px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
            <input value={form.host} onChange={e => setForm(p => ({ ...p, host: e.target.value }))} placeholder="Host"
              className="px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
            <input type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: Number(e.target.value) }))} placeholder="Port"
              className="px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.is_remote} onChange={e => setForm(p => ({ ...p, is_remote: e.target.checked }))} className="accent-primary" /> Remote server</label>
          {form.is_remote && <input value={form.remote_url} onChange={e => setForm(p => ({ ...p, remote_url: e.target.value }))} placeholder="Remote URL" className="w-full px-4 py-2.5 rounded-xl glass focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />}
          <div className="flex gap-2"><button onClick={handleSave} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition">Save</button><button onClick={resetForm} className="px-5 py-2 rounded-xl glass text-sm">Cancel</button></div>
        </div>
      )}

      <div className="space-y-2">
        {profiles.map(p => (
          <div key={p.id} className={`glass rounded-2xl p-4 ${p.is_active ? 'ring-2 ring-primary/50' : ''} flex items-center justify-between animate-fade-in`}>
            <div>
              <div className="flex items-center gap-2"><span className="font-medium text-sm">{p.name}</span>{p.is_active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">active</span>}{p.is_remote && <span className="text-[10px] px-2 py-0.5 rounded-full bg-info/20 text-info font-semibold">remote</span>}</div>
              <p className="text-xs text-text-muted mt-0.5">{p.model_path} &mdash; {p.host}:{p.port}</p>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => handleActivate(p.id)} disabled={p.is_active} className="px-3 py-1.5 rounded-lg bg-success/20 text-success text-xs disabled:opacity-30 hover:bg-success/30 transition">Set Active</button>
              <button onClick={() => handleEdit(p)} className="px-3 py-1.5 rounded-lg glass text-xs hover:bg-surface-2 transition">Edit</button>
              <button onClick={() => handleDelete(p.id)} className="px-3 py-1.5 rounded-lg bg-danger/20 text-danger text-xs hover:bg-danger/30 transition">Delete</button>
            </div>
          </div>
        ))}
        {profiles.length === 0 && <div className="glass rounded-2xl p-12 text-center text-text-muted text-sm"><p className="text-3xl mb-2 opacity-40">{'\ud83d\udccb'}</p><p>No profiles yet. Create one to save server configurations.</p></div>}
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { listServerProfiles, createServerProfile, updateServerProfile, deleteServerProfile, activateServerProfile } from '../api/endpoints'
import type { ServerProfile } from '../types'

export default function ServerProfilesPage() {
  const [profiles, setProfiles] = useState<ServerProfile[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ServerProfile | null>(null)
  const [form, setForm] = useState({ name: '', model_path: '', host: '127.0.0.1', port: 30000, args_json: '{}', is_remote: false, remote_url: '' })

  useEffect(() => { fetchProfiles() }, [])

  const fetchProfiles = async () => {
    try {
      const r = await listServerProfiles()
      setProfiles(r.data)
    } catch {}
  }

  const resetForm = () => {
    setForm({ name: '', model_path: '', host: '127.0.0.1', port: 30000, args_json: '{}', is_remote: false, remote_url: '' })
    setEditing(null)
    setShowForm(false)
  }

  const handleSave = async () => {
    try {
      if (editing) {
        await updateServerProfile(editing.id, form)
      } else {
        await createServerProfile(form)
      }
      resetForm()
      await fetchProfiles()
    } catch (e) { console.error(e) }
  }

  const handleEdit = (p: ServerProfile) => {
    setForm({ name: p.name, model_path: p.model_path, host: p.host, port: p.port, args_json: p.args_json, is_remote: p.is_remote, remote_url: p.remote_url || '' })
    setEditing(p)
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteServerProfile(id)
      await fetchProfiles()
    } catch {}
  }

  const handleActivate = async (id: number) => {
    try {
      await activateServerProfile(id)
      await fetchProfiles()
    } catch {}
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Server Profiles</h1>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm">+ New Profile</button>
      </div>

      {showForm && (
        <div className="bg-surface rounded-xl p-4 border border-border space-y-3">
          <h3 className="font-medium">{editing ? 'Edit Profile' : 'New Profile'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Profile name" className="px-3 py-2 bg-bg border border-border rounded text-white text-sm" />
            <input value={form.model_path} onChange={e => setForm(p => ({ ...p, model_path: e.target.value }))}
              placeholder="Model path (HF or local)" className="px-3 py-2 bg-bg border border-border rounded text-white text-sm" />
            <input value={form.host} onChange={e => setForm(p => ({ ...p, host: e.target.value }))}
              placeholder="Host" className="px-3 py-2 bg-bg border border-border rounded text-white text-sm" />
            <input type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: Number(e.target.value) }))}
              placeholder="Port" className="px-3 py-2 bg-bg border border-border rounded text-white text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_remote} onChange={e => setForm(p => ({ ...p, is_remote: e.target.checked }))} className="accent-primary" />
            Remote server
          </label>
          {form.is_remote && (
            <input value={form.remote_url} onChange={e => setForm(p => ({ ...p, remote_url: e.target.value }))}
              placeholder="Remote URL" className="w-full px-3 py-2 bg-bg border border-border rounded text-white text-sm" />
          )}
          <div className="flex gap-2">
            <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Save</button>
            <button onClick={resetForm} className="px-4 py-2 bg-surface-2 text-white rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {profiles.map((p) => (
          <div key={p.id} className={`bg-surface rounded-xl p-4 border ${p.is_active ? 'border-primary' : 'border-border'} flex items-center justify-between`}>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                {p.is_active && <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">active</span>}
                {p.is_remote && <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">remote</span>}
              </div>
              <p className="text-sm text-text-muted mt-1">{p.model_path} — {p.host}:{p.port}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleActivate(p.id)} disabled={p.is_active} className="px-3 py-1 bg-green-600/20 text-green-400 rounded text-sm disabled:opacity-30">Set Active</button>
              <button onClick={() => handleEdit(p)} className="px-3 py-1 bg-surface-2 text-text-muted rounded text-sm">Edit</button>
              <button onClick={() => handleDelete(p.id)} className="px-3 py-1 bg-red-600/20 text-red-400 rounded text-sm">Delete</button>
            </div>
          </div>
        ))}
        {profiles.length === 0 && <p className="text-text-muted text-sm text-center py-8">No profiles yet. Create one to save server configurations.</p>}
      </div>
    </div>
  )
}

import React, { useState, useRef } from 'react'
import { useChatStore } from '../../stores'
import { MessageSquare, Plus, Trash2, Folder, Upload, Trash, FileText } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Badge } from '../ui/Badge'
import { cn } from '../ui/cn'
import { toast } from '../ui/Toast'

export default function ConversationSidebar() {
  const {
    conversations,
    activeConv,
    loadConversation,
    newConversation,
    deleteConversation,
    ragCollections,
    ragDocuments,
    uploadRagDocument,
    deleteRagDocument,
    createRagCollection
  } = useChatStore()

  const [activeTab, setActiveTab] = useState<'history' | 'rag'>('history')
  const [newCollName, setNewCollName] = useState('')
  const [selectedCollection, setSelectedCollection] = useState('Default-Knowledge')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadRagDocument(selectedCollection, file)
      toast.success(`Uploaded ${file.name} to ${selectedCollection}`)
    } catch {
      toast.error("Failed to upload document.")
    }
  }

  const handleCreateCollection = () => {
    if (!newCollName.trim()) return
    createRagCollection(newCollName.trim())
    setSelectedCollection(newCollName.trim())
    setNewCollName('')
    toast.success(`Created collection: ${newCollName}`)
  }

  return (
    <div className="w-80 h-full border-r border-border bg-surface flex flex-col shrink-0">
      <div className="flex border-b border-border p-1 bg-surface-2/40">
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
            activeTab === 'history' ? "bg-surface text-text shadow-xs font-bold" : "text-text-muted hover:text-text"
          )}
        >
          Chat History
        </button>
        <button
          onClick={() => setActiveTab('rag')}
          className={cn(
            "flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
            activeTab === 'rag' ? "bg-surface text-text shadow-xs font-bold" : "text-text-muted hover:text-text"
          )}
        >
          RAG Knowledge
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'history' ? (
          <div className="space-y-4">
            <Button onClick={newConversation} className="w-full gap-2 text-xs font-bold h-9">
              <Plus size={14} /> New Conversation
            </Button>
            
            <div className="space-y-1">
              {conversations.map((c) => {
                const isActive = activeConv === c.id
                return (
                  <div
                    key={c.id}
                    onClick={() => loadConversation(c.id)}
                    className={cn(
                      "group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs cursor-pointer transition-all border border-transparent",
                      isActive 
                        ? "bg-primary/10 text-primary border-primary/20 font-semibold" 
                        : "hover:bg-surface-2 text-text"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MessageSquare size={13} className="shrink-0 opacity-60 text-primary" />
                      <span className="truncate pr-2">{c.title || 'Untitled chat'}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteConversation(c.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-danger/10 hover:text-danger text-text-muted transition-all cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })}

              {conversations.length === 0 && (
                <p className="text-xs text-text-muted text-center py-8 italic">No chats started yet.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5 animate-fade-in">
            {/* RAG Knowledge collections */}
            <div className="space-y-3">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">Collections</span>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input 
                    value={newCollName}
                    onChange={e => setNewCollName(e.target.value)}
                    placeholder="New collection name..."
                    className="h-8 text-xs"
                  />
                  <Button onClick={handleCreateCollection} size="sm" className="h-8 px-3 text-xs font-semibold">
                    Create
                  </Button>
                </div>

                <div className="space-y-1">
                  {ragCollections.map((col) => {
                    const isSelected = selectedCollection === col
                    return (
                      <div
                        key={col}
                        onClick={() => setSelectedCollection(col)}
                        className={cn(
                          "flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors border",
                          isSelected 
                            ? "bg-primary/10 border-primary/20 text-primary font-bold" 
                            : "bg-surface-2/40 border-transparent text-text hover:bg-surface-2"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Folder size={12} />
                          {col}
                        </span>
                        {isSelected && <Badge variant="success" className="text-[9px] py-0">Active</Badge>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Document upload block */}
            <div className="space-y-3 pt-3 border-t border-border">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">Document Upload</span>
              <div className="space-y-2.5">
                <input 
                  type="file" 
                  ref={fileRef} 
                  onChange={handleUpload} 
                  className="hidden" 
                  accept=".txt,.pdf,.csv,.json,.jsonl"
                />
                <Button 
                  onClick={() => fileRef.current?.click()} 
                  variant="outline" 
                  className="w-full gap-2 border-dashed border-primary/30 text-primary hover:bg-primary/5 h-16 flex flex-col justify-center items-center text-xs font-bold"
                >
                  <Upload size={16} />
                  <span>Choose file (.txt, .pdf, .jsonl)</span>
                </Button>
              </div>
            </div>

            {/* Uploaded documents list */}
            <div className="space-y-3 pt-3 border-t border-border">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                Documents in Collection ({ragDocuments.filter(d => d.collection === selectedCollection).length})
              </span>
              <div className="space-y-1.5">
                {ragDocuments
                  .filter(d => d.collection === selectedCollection)
                  .map((doc) => (
                    <div 
                      key={doc.id} 
                      className="flex items-center justify-between p-2 rounded-lg bg-surface-2 border border-border text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <FileText size={12} className="text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate text-text font-medium" title={doc.name}>{doc.name}</p>
                          <p className="text-[9px] text-text-muted mt-0.5 font-mono">{doc.size} KB</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => deleteRagDocument(doc.id)}
                        className="text-text-muted hover:text-danger p-1 rounded transition-colors cursor-pointer"
                        title="Delete document"
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  ))}

                {ragDocuments.filter(d => d.collection === selectedCollection).length === 0 && (
                  <p className="text-[10px] text-text-muted italic text-center py-4">No documents uploaded to this collection.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

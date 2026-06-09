import { useServerStore } from '../../stores'
import { Server, CheckCircle2, Globe, ClipboardList } from 'lucide-react'
import { Card, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { cn } from '../ui/cn'

export default function ServerPresets() {
  const { profiles, activeProfile, loadProfile, fetchProfiles } = useServerStore()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="font-semibold text-text text-sm flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" /> Configuration Profiles
        </h3>
        <Button variant="ghost" size="sm" onClick={fetchProfiles} className="text-xs font-bold text-primary">
          Refresh List
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {profiles.map((p) => {
          const isActive = activeProfile?.id === p.id
          return (
            <Card 
              key={p.id} 
              className={cn(
                "overflow-hidden cursor-pointer hover:border-primary/40 transition-all duration-300", 
                isActive ? "border-primary/50 ring-1 ring-primary/20 shadow-md" : ""
              )}
              onClick={() => loadProfile(p)}
            >
              <CardContent className="p-4 flex justify-between items-start gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-text text-sm">{p.name}</span>
                    {isActive && (
                      <Badge variant="default" className="text-[9px] uppercase tracking-wide gap-1 bg-primary text-white border-transparent">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Active
                      </Badge>
                    )}
                    {p.is_remote && (
                      <Badge variant="outline" className="text-[9px] uppercase tracking-wide gap-1 text-info border-info/30 bg-info/5">
                        <Globe className="w-2.5 h-2.5" /> Remote
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted mt-2 font-mono truncate max-w-[200px]" title={p.model_path}>
                    {p.model_path}
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5 font-mono">
                    {p.host}:{p.port}
                  </p>
                </div>
                
                <span className="text-xs font-semibold text-primary hover:text-primary-hover whitespace-nowrap">
                  Load Config
                </span>
              </CardContent>
            </Card>
          )
        })}

        {profiles.length === 0 && (
          <div className="col-span-2 flex flex-col items-center justify-center p-8 text-center bg-surface border border-dashed border-border rounded-xl">
            <ClipboardList className="h-8 w-8 text-text-muted opacity-50 mb-2" />
            <p className="text-xs font-semibold text-text">No profiles created yet</p>
            <p className="text-[10px] text-text-muted mt-0.5">Go to Server Profiles section to create one.</p>
          </div>
        )}
      </div>
    </div>
  )
}

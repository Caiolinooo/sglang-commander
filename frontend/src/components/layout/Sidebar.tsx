import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useConnectionsStore } from '../../stores'
import {
  LayoutDashboard,
  Server,
  MessageSquare,
  Box,
  FileText,
  Timer,
  Globe,
  Settings,
  Sun,
  Moon,
  LogOut,
  TerminalSquare,
  Shield,
  Activity,
  GitCompare,
  FileSpreadsheet,
  Network,
  ChevronDown
} from 'lucide-react'

const sections = [
  {
    title: 'Inference',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/server', label: 'Server Control', icon: Server },
      { to: '/chat', label: 'Playground Chat', icon: MessageSquare },
      { to: '/compare', label: 'Compare Models', icon: GitCompare },
    ]
  },
  {
    title: 'Automation',
    items: [
      { to: '/batch', label: 'Batch Processing', icon: FileSpreadsheet },
    ]
  },
  {
    title: 'Resources',
    items: [
      { to: '/models', label: 'Models Hub', icon: Box },
      { to: '/profiles', label: 'Server Profiles', icon: FileText },
      { to: '/connections', label: 'SSH Connections', icon: Network },
      { to: '/benchmark', label: 'Benchmark Latency', icon: Timer },
    ]
  },
  {
    title: 'System',
    items: [
      { to: '/diagnostics', label: 'Diagnostics', icon: Activity },
      { to: '/deploy', label: 'API Deployments', icon: Globe },
      { to: '/settings', label: 'Settings', icon: Settings },
    ]
  }
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { connections, activeConnectionId, setActiveConnection, loadConnections } = useConnectionsStore()

  useEffect(() => {
    loadConnections()
  }, [])

  const activeConn = connections.find(c => c.id === activeConnectionId)

  return (
    <div className="w-68 h-full bg-surface/40 backdrop-blur-2xl border-r border-white/5 flex flex-col transition-colors z-20 shrink-0 shadow-xl shadow-black/20">
      {/* Header */}
      <div className="h-[76px] px-6 flex items-center border-b border-white/5 relative">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"></div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-primary/30 border border-white/10 ring-2 ring-primary/20 ring-offset-1 ring-offset-transparent">
            <TerminalSquare size={18} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-extrabold text-text tracking-tight uppercase">SGLang</h2>
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded text-white bg-gradient-to-r from-primary to-indigo-500 shadow-sm tracking-widest">PRO</span>
            </div>
            <p className="text-[10px] text-text-muted/80 font-semibold tracking-wide">Commander v0.1.0</p>
          </div>
        </div>
      </div>

      {/* Global Connection Selector */}
      <div className="px-5 pt-5 pb-3">
        <label className="text-[10px] font-bold text-text-muted/60 uppercase tracking-widest block mb-2 px-1">
          Environment Target
        </label>
        <div className="relative group">
          <select
            value={activeConnectionId || ''}
            onChange={(e) => setActiveConnection(e.target.value || null)}
            className="w-full h-10 pl-3 pr-8 rounded-xl bg-surface-2/50 border border-white/5 text-xs text-text focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 cursor-pointer font-medium appearance-none transition-all hover:bg-surface-2/80 shadow-inner"
          >
            <option value="">Localhost (127.0.0.1)</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.host})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none group-hover:text-text transition-colors" />
        </div>
        <div className="mt-2.5 px-1.5 flex items-center gap-2 text-[10px] font-semibold text-text-muted/80">
          <span className="relative flex h-2 w-2">
            {!activeConnectionId && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${activeConnectionId ? 'bg-info' : 'bg-success'}`}></span>
          </span>
          <span>{activeConnectionId ? `Remote: ${activeConn?.name}` : 'Local Engine Active'}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto scrollbar-thin">
        {sections.map((section) => (
          <div key={section.title} className="space-y-2">
            <h3 className="px-4 text-[10px] font-bold text-text-muted/50 uppercase tracking-widest">
              {section.title}
            </h3>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                        isActive
                          ? 'bg-gradient-to-r from-primary/15 to-transparent text-primary font-bold shadow-sm'
                          : 'text-text-muted/80 hover:text-text hover:bg-surface-2/50'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r bg-primary shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
                        )}
                        <Icon size={18} className={`transition-all duration-300 ${isActive ? 'text-primary scale-110' : 'text-text-muted/70 group-hover:text-text group-hover:scale-105'}`} />
                        <span className="tracking-wide">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer / User section */}
      <div className="p-4 border-t border-white/5 bg-black/10 backdrop-blur-xl">
        <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-2/30 border border-white/5 hover:bg-surface-2/50 hover:border-white/10 transition-all duration-300 group">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary/30 to-indigo-600/30 border border-white/10 flex items-center justify-center text-sm text-white font-bold uppercase ring-2 ring-primary/10 group-hover:ring-primary/30 transition-all">
                {user?.username?.[0] || 'U'}
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-success border-2 border-surface shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-text truncate tracking-tight">{user?.username || 'User'}</span>
              <span className="text-[10px] text-text-muted/80 font-semibold flex items-center gap-1.5 mt-0.5">
                <Shield size={10} className="text-primary" /> Admin
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:bg-surface-2/80 text-text-muted hover:text-text transition-all active:scale-95"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button 
              onClick={logout}
              className="p-2 rounded-xl hover:bg-danger/15 hover:text-danger text-text-muted transition-all active:scale-95"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

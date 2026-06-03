import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { LayoutDashboard, Server, MessageSquare, Box, FileText, Timer, Globe, Settings, Sun, Moon, LogOut, TerminalSquare, Shield } from 'lucide-react'

const sections = [
  {
    title: 'Inference',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/server', label: 'Server Control', icon: Server },
      { to: '/chat', label: 'Playground Chat', icon: MessageSquare },
    ]
  },
  {
    title: 'Resources',
    items: [
      { to: '/models', label: 'Models Hub', icon: Box },
      { to: '/profiles', label: 'Server Profiles', icon: FileText },
      { to: '/benchmark', label: 'Benchmark Latency', icon: Timer },
    ]
  },
  {
    title: 'Management',
    items: [
      { to: '/deploy', label: 'API Deployments', icon: Globe },
      { to: '/settings', label: 'Settings', icon: Settings },
    ]
  }
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="w-64 h-full bg-surface border-r border-border flex flex-col transition-colors z-20 shrink-0">
      {/* Header */}
      <div className="h-16 px-6 flex items-center border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8.5 h-8.5 rounded-xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center text-white shadow-lg shadow-primary/25 border border-primary/20">
            <TerminalSquare size={18} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold text-text tracking-tight uppercase">SGLang</h2>
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/10 tracking-widest">PRO</span>
            </div>
            <p className="text-[10px] text-text-muted font-medium mt-0.5">Commander v0.1.0</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-6 overflow-y-auto scrollbar-thin">
        {sections.map((section) => (
          <div key={section.title} className="space-y-1.5">
            <h3 className="px-3 text-[10px] font-bold text-text-muted uppercase tracking-widest opacity-60">
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
                      `group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold shadow-sm'
                          : 'text-text-muted hover:text-text hover:bg-surface-2'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-primary" />
                        )}
                        <Icon size={17} className={`transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-primary' : 'text-text-muted group-hover:text-text'}`} />
                        <span>{item.label}</span>
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
      <div className="p-4 border-t border-border bg-surface/50 backdrop-blur-sm">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-2/40 border border-border/50 hover:border-border transition-all duration-300">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary/20 to-violet-600/20 border border-primary/30 flex items-center justify-center text-xs text-primary font-bold uppercase ring-2 ring-primary/5">
                {user?.username?.[0] || 'U'}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success border-2 border-surface" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-text truncate">{user?.username || 'User'}</span>
              <span className="text-[9px] text-text-muted font-medium flex items-center gap-1">
                <Shield size={9} className="text-primary" /> Admin
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={toggleTheme}
              className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text transition-colors"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button 
              onClick={logout}
              className="p-1.5 rounded-lg hover:bg-danger/10 hover:text-danger text-text-muted transition-colors"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


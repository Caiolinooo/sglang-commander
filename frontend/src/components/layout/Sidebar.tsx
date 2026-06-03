import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { LayoutDashboard, Server, MessageSquare, Box, FileText, Timer, Globe, Settings, Sun, Moon, LogOut, TerminalSquare } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/server', label: 'Server', icon: Server },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/models', label: 'Models', icon: Box },
  { to: '/profiles', label: 'Profiles', icon: FileText },
  { to: '/benchmark', label: 'Benchmark', icon: Timer },
  { to: '/deploy', label: 'Deploy', icon: Globe },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="w-64 h-full bg-surface border-r border-border flex flex-col transition-colors">
      {/* Header */}
      <div className="h-16 px-6 flex items-center border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-sm">
            <TerminalSquare size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text tracking-tight">SGLang Commander</h2>
            <p className="text-[10px] text-text-muted font-medium">v0.1.0</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-muted hover:text-text hover:bg-surface-2'
                }`
              }
            >
              <Icon size={18} className="transition-transform group-hover:scale-110" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Footer / User section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center text-xs text-text font-bold uppercase">
              {user?.username?.[0] || 'U'}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text truncate max-w-[100px]">{user?.username || 'User'}</span>
              <span className="text-[10px] text-text-muted">Administrator</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleTheme}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md bg-surface-2 hover:bg-border-hover text-xs text-text transition-colors"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          
          <button 
            onClick={logout}
            className="p-2 rounded-md bg-surface-2 hover:bg-danger/10 hover:text-danger text-text-muted transition-colors"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

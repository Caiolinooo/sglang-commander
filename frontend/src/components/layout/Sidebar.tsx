import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '\ud83d\udcca' },
  { to: '/server', label: 'Server', icon: '\ud83d\udda5\ufe0f' },
  { to: '/chat', label: 'Chat', icon: '\ud83d\udcac' },
  { to: '/models', label: 'Models', icon: '\ud83e\udd16' },
  { to: '/profiles', label: 'Profiles', icon: '\ud83d\udccb' },
  { to: '/benchmark', label: 'Benchmark', icon: '\u23f1\ufe0f' },
  { to: '/deploy', label: 'Deploy', icon: '\ud83c\udf10' },
  { to: '/settings', label: 'Settings', icon: '\u2699\ufe0f' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="w-60 h-full glass flex flex-col border-r border-border/50">
      <div className="p-5 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-primary/20">
            {'\u25b6'}
          </div>
          <div>
            <h2 className="text-sm font-bold gradient-text">SGLang</h2>
            <p className="text-[10px] text-text-muted">Commander v0.1.0</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-primary/15 text-primary font-medium shadow-sm'
                  : 'text-text-muted hover:text-text hover:bg-surface/50'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-border/50 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-[10px] text-white font-bold">
              {user?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <p className="text-xs text-text-muted truncate max-w-[100px]">{user?.username || 'User'}</p>
          </div>
          <button onClick={toggleTheme}
            className="w-7 h-7 rounded-lg bg-surface/50 hover:bg-surface text-xs transition flex items-center justify-center"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? '\u2600\ufe0f' : '\ud83c\udf19'}
          </button>
        </div>
        <button onClick={logout}
          className="w-full py-1.5 rounded-lg text-xs text-danger hover:bg-danger/10 transition">
          Sign out
        </button>
      </div>
    </div>
  )
}

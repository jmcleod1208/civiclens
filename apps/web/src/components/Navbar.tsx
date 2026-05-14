import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Sun, Moon, Search, User, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { useTheme } from '../lib/theme-context'
import { useAuth } from '../lib/auth-context'

const NAV_LINKS = [
  { to: '/',             label: 'Feed' },
  { to: '/search',       label: 'Search' },
  { to: '/school-boards',label: 'School Boards' },
]

export function Navbar() {
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/onboarding')
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-[var(--color-surface)]/90 dark:bg-[var(--color-surface-dark)]/90 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-4">
        {/* Logo */}
        <Link
          to="/"
          className="font-display text-xl text-[var(--color-teal-600)] dark:text-[var(--color-teal-400)] shrink-0"
        >
          CivicLens
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--color-teal-50)] dark:bg-[var(--color-teal-900)]/40 text-[var(--color-teal-600)] dark:text-[var(--color-teal-400)]'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 ml-auto">
          {/* Search shortcut */}
          <Link
            to="/search"
            className="p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
          </Link>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Account / auth */}
          {user ? (
            <>
              <Link
                to="/account"
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <User className="w-4 h-4" />
                Account
              </Link>
              <button
                onClick={handleLogout}
                className="hidden md:flex items-center gap-1.5 p-2 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <Link
              to="/onboarding"
              className="hidden md:inline-flex items-center rounded-full bg-[var(--color-teal-500)] hover:bg-[var(--color-teal-600)] text-white text-sm font-medium px-4 py-1.5 transition-colors"
            >
              Sign in
            </Link>
          )}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Menu"
          >
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <nav className="md:hidden border-t border-[var(--color-border)] dark:border-[var(--color-border-dark)] px-4 py-3 flex flex-col gap-1 bg-[var(--color-surface)] dark:bg-[var(--color-surface-dark)]">
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--color-teal-50)] dark:bg-[var(--color-teal-900)]/40 text-[var(--color-teal-600)]'
                    : 'text-gray-700 dark:text-gray-300'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
          {user ? (
            <>
              <Link to="/account" onClick={() => setMenuOpen(false)} className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">Account</Link>
              <button onClick={() => { handleLogout(); setMenuOpen(false) }} className="text-left px-3 py-2 text-sm text-red-500">Sign out</button>
            </>
          ) : (
            <Link to="/onboarding" onClick={() => setMenuOpen(false)} className="px-3 py-2 text-sm font-medium text-[var(--color-teal-600)]">Sign in</Link>
          )}
        </nav>
      )}
    </header>
  )
}

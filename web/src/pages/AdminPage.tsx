import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AdminAvatar } from './adminShared'

// Icon helper — matches the Lucide-style stroke icons used in the app nav.
function Icon({ d }: { d: string | string[] }) {
  const paths = Array.isArray(d) ? d : [d]
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  )
}

const NAV = [
  {
    to: '/admin',
    end: true,
    label: 'Overview',
    icon: ['M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z'],
  },
  {
    to: '/admin/users',
    label: 'Users',
    icon: ['M16 19a4 4 0 00-8 0', 'M12 8m-3.2 0a3.2 3.2 0 106.4 0a3.2 3.2 0 10-6.4 0'],
  },
  {
    to: '/admin/trips',
    label: 'Trips',
    icon: ['M4 8h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1V8z', 'M9 8V5a1 1 0 011-1h4a1 1 0 011 1v3'],
  },
  {
    to: '/admin/system',
    label: 'System',
    icon: [
      'M12 15a3 3 0 100-6 3 3 0 000 6z',
      'M19.4 13a7 7 0 000-2l2-1.5-2-3.5-2.3 1a7 7 0 00-1.7-1L14.9 3H9.1l-.5 2.5a7 7 0 00-1.7 1l-2.3-1-2 3.5L4.6 11a7 7 0 000 2l-2 1.5 2 3.5 2.3-1a7 7 0 001.7 1l.5 2.5h5.8l.5-2.5a7 7 0 001.7-1l2.3 1 2-3.5-2-1.5z',
    ],
  },
]

// AdminPage is the shell for the admin backoffice (M08.5 redesign): a left rail
// (Overview / Users / Trips) plus an <Outlet> for the active section. Visible
// only to is_admin users (RequireAdmin in App.tsx; server-side enforcement is
// authoritative). Uses design tokens throughout, so light/dark come for free.
export function AdminPage() {
  const { user } = useAuth()

  return (
    <div className="admin-app">
      <aside className="admin-rail">
        <div className="admin-brand">
          <div className="mark">K</div>
          <div>
            <div className="bt">Khiimori</div>
            <div className="bs">Admin</div>
          </div>
        </div>

        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? 'admin-nav active' : 'admin-nav')}
          >
            <Icon d={item.icon} />
            {item.label}
          </NavLink>
        ))}

        <div className="admin-railfoot">
          <AdminAvatar
            name={user?.name ?? ''}
            email={user?.email ?? ''}
            avatar={user?.avatar}
            size={30}
          />
          <div className="who">
            <b>{user?.name || 'Admin'}</b>
            <span>{user?.email}</span>
          </div>
        </div>
        <NavLink to="/" className="admin-back">
          <Icon d="M15 18l-6-6 6-6" />
          Back to app
        </NavLink>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}

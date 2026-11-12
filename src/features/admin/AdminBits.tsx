import { Typography } from '@montage-ui/core'
import { NavLink, Outlet } from 'react-router'
import { ADMIN_COPY as T } from './adminCopy'
import './admin.css'

const TABS: [to: string, label: string, end?: boolean][] = [
  ['/admin', T.tabs.overview, true],
  ['/admin/clubs', T.tabs.clubs],
  ['/admin/users', T.tabs.users],
  ['/admin/audit-logs', T.tabs.audit],
]

/** The shell of SADM-001 ~ 005: the title with 나가기 and the four tabs (instead of the club switcher). */
export function AdminLayout() {
  return (
    <div className="admin">
      <header className="admin-head">
        <Typography variant="title2" weight="bold" as="h1">
          {T.title}
        </Typography>
        <NavLink to="/">{T.leave}</NavLink>
      </header>
      <nav className="admin-tabs" aria-label={T.title}>
        {TABS.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={end}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}

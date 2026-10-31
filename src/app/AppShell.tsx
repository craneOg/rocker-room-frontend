import {
  BottomNavigation,
  BottomNavigationItem,
  Button,
  TopNavigation,
  TopNavigationButton,
  Typography,
  useThemeControl,
} from '@montage-ui/core'
import {
  IconCalendar,
  IconHome,
  IconMusicMicrophone,
  IconPerson,
  IconPersons,
} from '@montage-ui/icon'
import { useEffect, type ReactNode } from 'react'
import {
  NavLink,
  Outlet,
  useLocation,
  useMatches,
  useNavigate,
  useParams,
} from 'react-router'
import { useSession } from '../shared/auth/session'
import { readLastClubId } from '../shared/lib/lastClub'
import { COPY } from '../shared/ui/copy'
import { notFoundStore, warningsStore } from '../shared/ui/feedbackBus'
import { NotFoundView } from '../shared/ui/StateViews'
import { WarningBanner } from '../shared/ui/WarningBanner'
import type { RouteHandle } from './routes'

const SERVICE_NAME = '록커룸' // temporary service name

type NavItem = {
  id: string
  label: string
  to: string
  icon: ReactNode
  tab: boolean
}

function useNavItems(): NavItem[] {
  const params = useParams()
  const clubId = params.clubId ?? readLastClubId()
  const clubBase = clubId ? `/clubs/${clubId}` : null
  return [
    {
      id: 'home',
      label: '홈',
      to: clubBase ?? '/',
      icon: <IconHome />,
      tab: true,
    },
    {
      id: 'performances',
      label: '공연',
      to: clubBase ? `${clubBase}/performances` : '/',
      icon: <IconMusicMicrophone />,
      tab: true,
    },
    {
      id: 'calendar',
      label: '캘린더',
      to: '/calendar',
      icon: <IconCalendar />,
      tab: true,
    },
    // Side navigation only: the bottom bar has 4 tabs.
    {
      id: 'clubs',
      label: '동아리',
      to: '/clubs/search',
      icon: <IconPersons />,
      tab: false,
    },
    { id: 'me', label: '내 정보', to: '/me', icon: <IconPerson />, tab: true },
  ]
}

function activeId(pathname: string): string | undefined {
  if (pathname.startsWith('/calendar')) return 'calendar'
  if (pathname.startsWith('/me')) return 'me'
  if (/^\/clubs\/(search|join|new)/.test(pathname)) return 'clubs'
  if (/^\/clubs\/[^/]+\/performances/.test(pathname)) return 'performances'
  if (
    /^\/clubs\/[^/]+/.test(pathname) ||
    pathname === '/' ||
    pathname === '/start'
  )
    return 'home'
  return undefined
}

/** Temporary light/dark switch until the "내 정보" screen exists. */
function ThemeToggle() {
  const { theme, setTheme } = useThemeControl()
  return (
    <Button
      size="small"
      variant="outlined"
      color="assistive"
      aria-label={COPY.themeLabel}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? '라이트 모드' : '다크 모드'}
    </Button>
  )
}

export function AppShell() {
  const session = useSession()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const matches = useMatches()
  const items = useNavItems()
  const notFound = notFoundStore.use()
  const warnings = warningsStore.use()

  useEffect(() => {
    notFoundStore.set(false)
    warningsStore.set([])
  }, [pathname])

  const handle = matches.at(-1)?.handle as RouteHandle | undefined
  const content = (
    <>
      <WarningBanner
        warnings={warnings}
        onClose={() => warningsStore.set([])}
      />
      {notFound ? <NotFoundView onHome={() => navigate('/')} /> : <Outlet />}
    </>
  )

  if (session.status !== 'authenticated') {
    return (
      <div className="shell-bare">
        <main className="main-inner">{content}</main>
      </div>
    )
  }

  const current = activeId(pathname)
  return (
    <div className="shell">
      <aside className="sidenav" aria-label="주 메뉴">
        <Typography variant="heading2" weight="bold" className="sidenav-brand">
          {SERVICE_NAME}
        </Typography>
        <nav className="sidenav-list">
          {items.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              className={`sidenav-item${current === item.id ? ' is-active' : ''}`}
              aria-current={current === item.id ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidenav-footer">
          <ThemeToggle />
        </div>
      </aside>

      <header className="topbar">
        {handle?.sub ? (
          <TopNavigation
            leadingContent={
              <TopNavigationButton
                variant="back-button"
                aria-label="뒤로"
                onClick={() => navigate(-1)}
              />
            }
            trailingContent={<ThemeToggle />}
          >
            {handle.title}
          </TopNavigation>
        ) : (
          <TopNavigation variant="display" trailingContent={<ThemeToggle />}>
            {SERVICE_NAME}
          </TopNavigation>
        )}
      </header>

      <main className="main" id="main">
        <div className="main-inner">
          {content}
          <footer className="attribution">{COPY.attribution}</footer>
        </div>
      </main>

      <nav className="tabbar" aria-label="하단 메뉴">
        <BottomNavigation
          value={current}
          onValueChange={(id) =>
            navigate(items.find((i) => i.id === id)?.to ?? '/')
          }
        >
          {items
            .filter((i) => i.tab)
            .map((i) => (
              <BottomNavigationItem
                key={i.id}
                value={i.id}
                label={i.label}
                icon={i.icon}
              />
            ))}
        </BottomNavigation>
      </nav>
    </div>
  )
}

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '../../shared/auth/session'
import { feedback } from '../../shared/ui/feedbackBus'
import { confirmSuccessionNotice, getSuccessionNotices } from './api'
import { HOME_COPY as T } from './copy'

/**
 * HOME-001 0-1: shows each unconfirmed succession notice of this club once, one after another,
 * and confirms it on the server (D-2: stored per user, so it never comes back on another device).
 */
export function SuccessionNotices({ clubId }: { clubId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const name = useSession().me?.name ?? ''
  const { data } = useQuery({
    queryKey: ['succession-notices'],
    queryFn: getSuccessionNotices,
  })
  // StrictMode runs effects twice and the list refetches: each notice is shown once.
  const shown = useRef(new Set<string>())

  useEffect(() => {
    const todo = (data ?? []).filter(
      (n) => n.clubId === clubId && !shown.current.has(n.id),
    )
    todo.forEach((n) => shown.current.add(n.id))
    void (async () => {
      for (const n of todo) {
        const admin = n.type === 'ADMIN'
        const choice = await feedback.dialog({
          title: admin ? T.adminNoticeTitle : T.leaderNoticeTitle,
          description: admin
            ? T.adminNoticeBody(n.clubName, name)
            : T.leaderNoticeBody(
                n.performanceName ?? '',
                n.teamName ?? '',
                name,
              ),
          // Both buttons count as "seen": the notice is confirmed either way.
          confirmLabel: admin ? T.noticeGoMembers : T.noticeConfirm,
          cancelLabel: admin ? T.noticeConfirm : undefined,
        })
        try {
          await confirmSuccessionNotice(n.id)
        } catch {
          // Not confirmed: it shows again on the next visit.
        }
        if (admin && choice === 'confirm') navigate(`/clubs/${clubId}/members`)
      }
      await queryClient.invalidateQueries({ queryKey: ['succession-notices'] })
    })()
  }, [data, clubId, name, navigate, queryClient])

  return null
}

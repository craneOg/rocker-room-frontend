import { Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { formatKstYmd } from '../../shared/lib/time'
import { Badge } from '../../shared/ui/Badge'
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../shared/ui/StateViews'
import { performanceKey } from '../performance/api'
import { listMyAuditions, type MyAudition } from './auditionApi'
import { whenText } from './auditionBits'
import { AUDITION_COPY as T } from './auditionCopy'
import './audition.css'

function Card({ a }: { a: MyAudition }) {
  return (
    <article className="audition-card">
      <div className="perf-card-head">
        <Typography variant="body1" weight="bold">
          {a.songTitle}
        </Typography>
        <Badge kind="audition" value={a.result ?? 'PENDING'} />
      </div>
      {a.partName ? (
        <Typography variant="body2">{a.partName}</Typography>
      ) : null}
      <Typography
        variant="caption1"
        color="semantic.foreground.neutral.secondary"
      >
        {whenText(a.scheduledAt)}
      </Typography>
      {a.judgedAt ? (
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.secondary"
        >
          {formatKstYmd(a.judgedAt)}
        </Typography>
      ) : null}
      {a.comment ? <Typography variant="body2">{a.comment}</Typography> : null}
    </article>
  )
}

/** The API sorts a re-audition group newest first; only the newest has `isLatest` (A-07). */
const groupLatest = (items: MyAudition[]) => {
  const groups: { latest: MyAudition; earlier: MyAudition[] }[] = []
  for (const a of items) {
    const last = groups.at(-1)
    if (!a.isLatest && last) last.earlier.push(a)
    else groups.push({ latest: a, earlier: [] })
  }
  return groups
}

/** AUDI-004: my own audition results of this performance, older re-audition results folded. */
export function MyAuditions() {
  const { clubId = '', performanceId = '' } = useParams()
  const q = useQuery({
    queryKey: [...performanceKey(clubId, performanceId), 'my-auditions'],
    queryFn: () => listMyAuditions(clubId, performanceId),
  })

  return (
    <div className="start" data-screen-id="AUDI-004">
      <Typography variant="title2" weight="bold" as="h1">
        {T.mineTitle}
      </Typography>
      {q.isPending ? <ListSkeleton /> : null}
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : null}
      {q.isSuccess && q.data.length === 0 ? (
        <EmptyState description={T.empty} />
      ) : null}
      {q.isSuccess
        ? groupLatest(q.data).map((g) => (
            <div key={g.latest.id} className="audition-earlier">
              <Card a={g.latest} />
              {g.earlier.length > 0 ? (
                <details>
                  <summary>{T.earlier(g.earlier.length)}</summary>
                  {g.earlier.map((a) => (
                    <Card key={a.id} a={a} />
                  ))}
                </details>
              ) : null}
            </div>
          ))
        : null}
    </div>
  )
}

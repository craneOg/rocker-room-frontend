import { Button, Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { getOverview, type OverviewTrendPoint } from './adminApi'
import { ADMIN_COPY as T } from './adminCopy'
import { dateText } from './adminDates'

const PERIODS = [7, 30, 90]
type Series = keyof typeof T.trend

/** One grey line per series (the wireframe's line-chart box), scaled to its own maximum. */
function Spark({
  points,
  field,
}: {
  points: OverviewTrendPoint[]
  field: Series
}) {
  const values = points.map((p) => p[field])
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? 100 / (values.length - 1) : 0
  const line = values
    .map((v, i) => `${i * step},${40 - (v / max) * 36}`)
    .join(' ')
  return (
    <svg
      className="admin-spark"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      role="img"
      aria-label={T.trend[field]}
    >
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}

/** SADM-001: service-wide numbers and the clubs that need attention (aggregates only). */
export function AdminOverview() {
  const [days, setDays] = useState(30)
  const overview = useQuery({
    queryKey: ['admin', 'overview', days],
    queryFn: () => getOverview(days),
  })
  const o = overview.data

  let body
  if (overview.isError)
    body = <ErrorState onRetry={() => void overview.refetch()} />
  else if (!o) body = <ListSkeleton rows={4} />
  else
    body = (
      <>
        <section className="admin-tiles" aria-label={T.tabs.overview}>
          {(Object.keys(T.metrics) as (keyof typeof T.metrics)[]).map((k) => (
            <div key={k} className="admin-tile">
              <Typography variant="caption1">{T.metrics[k]}</Typography>
              <Typography variant="title2" weight="bold">
                {o.metrics[k].toLocaleString('ko-KR')}
              </Typography>
            </div>
          ))}
        </section>

        <section>
          <Typography variant="body1" weight="bold" as="h2">
            {T.trendTitle}
          </Typography>
          <div className="admin-row">
            {PERIODS.map((d) => (
              <Button
                key={d}
                size="small"
                variant={d === days ? 'solid' : 'outlined'}
                color={d === days ? 'primary' : 'assistive'}
                aria-pressed={d === days}
                onClick={() => setDays(d)}
              >
                {T.period(d)}
              </Button>
            ))}
          </div>
          <div className="admin-tiles">
            {(Object.keys(T.trend) as Series[]).map((k) => (
              <div key={k} className="admin-tile">
                <Typography variant="caption1">{T.trend[k]}</Typography>
                <Spark points={o.trend} field={k} />
              </div>
            ))}
          </div>
          <details>
            <summary>{T.trendTable}</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">{T.trendDate}</th>
                  {(Object.keys(T.trend) as Series[]).map((k) => (
                    <th key={k} scope="col">
                      {T.trend[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {o.trend.map((p) => (
                  <tr key={p.date}>
                    <th scope="row">{dateText(p.date)}</th>
                    {(Object.keys(T.trend) as Series[]).map((k) => (
                      <td key={k}>{p[k].toLocaleString('ko-KR')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        <section>
          <Typography variant="body1" weight="bold" as="h2">
            {T.joinTitle}
          </Typography>
          <div className="admin-tiles">
            {(Object.keys(T.join) as (keyof typeof T.join)[]).map((k) => (
              <div key={k} className="admin-tile">
                <Typography variant="caption1">{T.join[k]}</Typography>
                <Typography variant="body1" weight="bold">
                  {o.joinStatus[k].toLocaleString('ko-KR')}
                </Typography>
              </div>
            ))}
          </div>
        </section>

        <section>
          <Typography variant="body1" weight="bold" as="h2">
            {T.attentionTitle}
          </Typography>
          {o.attention.length === 0 ? (
            <Typography variant="body2">{T.attentionEmpty}</Typography>
          ) : (
            <ul className="admin-list">
              {o.attention.map((a) => (
                <li key={`${a.clubId}-${a.reason}`}>
                  <Link to={`/admin/clubs/${a.clubId}`}>{a.clubName}</Link>
                  <Typography variant="body2">
                    {T.attentionReason[a.reason] ?? a.reason}
                  </Typography>
                  <Typography variant="caption1">
                    {dateText(a.lastAdminActiveAt)}
                  </Typography>
                </li>
              ))}
            </ul>
          )}
          <Typography variant="caption1">{T.monitoring}</Typography>
        </section>
      </>
    )

  return (
    <div data-screen-id="SADM-001" className="admin-body">
      {body}
    </div>
  )
}

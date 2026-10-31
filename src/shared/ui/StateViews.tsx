import {
  FallbackView,
  FallbackViewActionArea,
  FallbackViewActionAreaButton,
  FallbackViewContent,
  FallbackViewText,
  Loading,
  Skeleton,
} from '@montage-ui/core'
import { COPY } from './copy'

/** COM-003 #8: shown for 404 (existence and permission are not distinguished). */
export function NotFoundView({ onHome }: { onHome: () => void }) {
  return (
    <FallbackView>
      <FallbackViewContent>
        <FallbackViewText
          title={COPY.notFoundTitle}
          description={COPY.notFoundDescription}
        />
        <FallbackViewActionArea variant="single">
          <FallbackViewActionAreaButton onClick={onHome}>
            {COPY.goHome}
          </FallbackViewActionAreaButton>
        </FallbackViewActionArea>
      </FallbackViewContent>
    </FallbackView>
  )
}

/** COM-003 #11: `action` is the permission-appropriate main button; omit it for users who cannot act. */
export function EmptyState({
  description = COPY.emptyTitle,
  actionLabel,
  onAction,
}: {
  description?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <FallbackView>
      <FallbackViewContent>
        <FallbackViewText description={description} />
        {actionLabel && onAction ? (
          <FallbackViewActionArea variant="single">
            <FallbackViewActionAreaButton onClick={onAction}>
              {actionLabel}
            </FallbackViewActionAreaButton>
          </FallbackViewActionArea>
        ) : null}
      </FallbackViewContent>
    </FallbackView>
  )
}

/** COM-003 #12: skeleton with the same row structure as the list it stands in for. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-list" role="status" aria-label={COPY.loading}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" />
        </div>
      ))}
    </div>
  )
}

export function PageLoading() {
  return (
    <div className="page-loading" role="status" aria-label={COPY.loading}>
      <Loading variant="circular" />
    </div>
  )
}

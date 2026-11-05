import { Button, TextField, Typography } from '@montage-ui/core'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { EmptyState, ListSkeleton } from '../../shared/ui/StateViews'
import { searchClubs, type JoinPreview } from './api'
import {
  ClubInfo,
  CLUB_JOIN_KEY,
  JoinAction,
  useJoinRequest,
} from './ClubParts'
import { CLUB_COPY as T } from './copy'

/** CLUB-003: find a public club by name and apply (path B). */
export function ClubSearch() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState<string | null>(null)
  const trimmed = input.trim()
  const tooShort = trimmed.length === 1

  const results = useInfiniteQuery({
    queryKey: [CLUB_JOIN_KEY, 'search', query],
    queryFn: ({ pageParam, signal }) =>
      searchClubs(query ?? '', pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.page + 1 < last.totalPages ? last.page + 1 : undefined,
    enabled: query !== null,
  })
  const join = useJoinRequest()
  const items = results.data?.pages.flatMap((p) => p.items) ?? []

  const apply = async (preview: JoinPreview) => {
    const choice = await feedback.dialog({
      title: T.applyConfirmTitle(preview.club.name),
      description: preview.club.description ?? undefined,
      cancelLabel: COPY.cancel,
      confirmLabel: T.apply,
    })
    if (choice === 'confirm')
      join.mutate({ club: preview.club, body: { source: 'SEARCH' } })
  }

  return (
    <div className="start" data-screen-id="CLUB-003">
      <Typography variant="title2" weight="bold" as="h1">
        {T.searchTitle}
      </Typography>

      <form
        className="club-code-row"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          if (trimmed.length >= 2) setQuery(trimmed)
        }}
      >
        <div className="club-search-field">
          <TextField
            value={input}
            placeholder={T.searchPlaceholder}
            aria-label={T.searchPlaceholder}
            status={tooShort ? 'negative' : 'normal'}
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="helper-slot">
            {tooShort ? (
              <Typography
                variant="caption1"
                color="semantic.foreground.negative.primary"
              >{`* ${T.searchShort}`}</Typography>
            ) : null}
          </div>
        </div>
        <Button type="submit" size="large" disabled={trimmed.length < 2}>
          {T.searchTitle}
        </Button>
      </form>

      {results.isPending && query !== null ? <ListSkeleton /> : null}
      {results.isSuccess && items.length === 0 ? (
        <EmptyState description={T.searchEmpty} />
      ) : null}
      {items.map((preview) => (
        <article key={preview.club.id} className="start-card">
          <ClubInfo club={preview.club} />
          <JoinAction
            preview={preview}
            pending={join.isPending}
            onApply={() => void apply(preview)}
          />
        </article>
      ))}
      {results.hasNextPage ? (
        <Button
          variant="outlined"
          color="assistive"
          loading={results.isFetchingNextPage}
          onClick={() => void results.fetchNextPage()}
        >
          {T.loadMore}
        </Button>
      ) : null}
    </div>
  )
}

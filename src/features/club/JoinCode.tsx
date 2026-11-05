import { Button, TextField, Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { FormField } from '../../shared/ui/FormField'
import { ListSkeleton } from '../../shared/ui/StateViews'
import { JOIN_CODE_PATTERN, normalizeJoinCode, resolveJoinCode } from './api'
import {
  ClubInfo,
  CLUB_JOIN_KEY,
  JoinAction,
  useJoinRequest,
} from './ClubParts'
import { CLUB_COPY as T } from './copy'

/** CLUB-002: join a club with the code an admin handed out (path A). */
export function JoinCode({ initialCode = '' }: { initialCode?: string }) {
  const start = normalizeJoinCode(initialCode)
  const [input, setInput] = useState(start)
  // A link whose code can never match is as invalid as an unknown code (CLUB-002 1).
  const [code, setCode] = useState<string | null>(
    JOIN_CODE_PATTERN.test(start) ? start : null,
  )
  const [badLink, setBadLink] = useState(start !== '' && code === null)
  const valid = JOIN_CODE_PATTERN.test(input)

  const preview = useQuery({
    queryKey: [CLUB_JOIN_KEY, 'code', code],
    queryFn: () => resolveJoinCode(code ?? ''),
    enabled: code !== null,
    // The code can be re-issued any time: never show a stale preview.
    gcTime: 0,
  })
  const join = useJoinRequest()
  const invalid = badLink || preview.data === null

  return (
    <div className="start" data-screen-id="CLUB-002">
      <Typography variant="title2" weight="bold" as="h1">
        {T.codeTitle}
      </Typography>

      <form
        className="club-code-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) setCode(input)
        }}
      >
        <FormField
          label={T.codeLabel}
          error={invalid ? T.codeInvalid : undefined}
        >
          <TextField
            value={input}
            placeholder={T.codePlaceholder}
            maxLength={10}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            status={invalid ? 'negative' : 'normal'}
            onChange={(e) => {
              setInput(normalizeJoinCode(e.target.value))
              setCode(null)
              setBadLink(false)
            }}
          />
        </FormField>
        <Button type="submit" size="large" disabled={!valid}>
          {T.codeConfirm}
        </Button>
      </form>

      {preview.isFetching ? <ListSkeleton rows={1} /> : null}
      {preview.data && !preview.isFetching ? (
        <article className="start-card">
          <ClubInfo club={preview.data.club} />
          <JoinAction
            preview={preview.data}
            pending={join.isPending}
            onApply={() =>
              join.mutate({
                club: preview.data!.club,
                body: { source: 'JOIN_CODE', joinCode: code ?? '' },
              })
            }
          />
        </article>
      ) : null}
    </div>
  )
}

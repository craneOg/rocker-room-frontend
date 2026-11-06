import {
  Avatar,
  Button,
  RadioGroup,
  RadioGroupItem,
  TextField,
  TextFieldContent,
  Typography,
} from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { formatKstShort } from '../../shared/lib/time'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import { EmptyState, ListSkeleton } from '../../shared/ui/StateViews'
import { COPY } from '../../shared/ui/copy'
import {
  InviteTargetError,
  inviteMember,
  lookupUser,
  memberKey,
  normalizeHandle,
  type UserLookup,
} from './joinManageApi'
import { JOIN_MANAGE_COPY as T } from './joinManageCopy'

type MemberType = 'REGULAR' | 'GUEST'

/** C-06: what stands in the way of inviting this person, or null when an invite can go out. */
function blocker(
  membership: UserLookup['membership'],
  clubId: string,
  go: (path: string) => void,
) {
  if (!membership) return null
  const { status, invitationExpiresAt } = membership
  if (status === 'PENDING')
    return {
      text: T.alreadyPending,
      link: {
        label: T.goJoinManage,
        onClick: () => go(`/clubs/${clubId}/join-requests`),
      },
    }
  if (status === 'INVITED') {
    // An expired invite may be sent again (C-05).
    if (!invitationExpiresAt || Date.parse(invitationExpiresAt) <= Date.now())
      return null
    return {
      text: T.alreadyInvited(formatKstShort(invitationExpiresAt).slice(0, 5)),
    }
  }
  return { text: T.alreadyMember }
}

/** CLUB-105: find one person by the exact handle and invite them (path C; officers only). */
export function MemberAdd() {
  const { clubId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [input, setInput] = useState('')
  const [handle, setHandle] = useState<string | null>(null)
  const [memberType, setMemberType] = useState<MemberType>('REGULAR')
  const typed = normalizeHandle(input)

  const lookup = useQuery({
    queryKey: [...memberKey(clubId), 'lookup', handle],
    queryFn: ({ signal }) => lookupUser(clubId, handle ?? '', signal),
    enabled: handle !== null,
    // Their membership can change any time: never show a stale card.
    gcTime: 0,
  })
  const invite = useMutation({
    mutationFn: (h: string) => inviteMember(clubId, { handle: h, memberType }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: memberKey(clubId) })
      feedback.toast(T.invited, 'positive')
      navigate(`/clubs/${clubId}/join-requests?tab=invites`)
    },
    // Someone else got there first, or the account is gone: show the current state again.
    onError: (e) => {
      void queryClient.invalidateQueries({ queryKey: memberKey(clubId) })
      if (e instanceof InviteTargetError)
        feedback.toast(
          e.reason === 'gone' ? T.inviteGone : T.inviteDuplicate,
          'negative',
        )
    },
  })

  const found = lookup.data ?? null
  const notFound = handle !== null && lookup.isSuccess && found === null
  const stop = found ? blocker(found.membership, clubId, navigate) : null

  return (
    <div className="start" data-screen-id="CLUB-105">
      <Typography variant="title2" weight="bold" as="h1">
        {T.addTitle}
      </Typography>

      <form
        className="club-code-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (typed) setHandle(typed)
        }}
      >
        <FormField
          label={T.handleLabel}
          error={notFound ? T.handleNotFound : undefined}
          hint={T.handleHint}
        >
          <TextField
            value={input}
            placeholder={T.handlePlaceholder}
            maxLength={30}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            status={notFound ? 'negative' : 'normal'}
            leadingContent={
              <TextFieldContent variant="text">@</TextFieldContent>
            }
            onChange={(e) => {
              setInput(normalizeHandle(e.target.value))
              setHandle(null)
            }}
          />
        </FormField>
        <Button type="submit" size="large" disabled={!typed}>
          {T.find}
        </Button>
      </form>

      {handle !== null && lookup.isFetching ? <ListSkeleton rows={1} /> : null}
      {lookup.isError && !lookup.isFetching ? (
        <EmptyState
          description={COPY.unknownError}
          actionLabel={COPY.retry}
          onAction={() => void lookup.refetch()}
        />
      ) : null}

      {found && !lookup.isFetching ? (
        <>
          <article className="start-card">
            <div className="member-person">
              <Avatar
                size="medium"
                src={found.profileImageUrl ?? undefined}
                alt=""
              />
              <div className="start-card-text">
                <Typography variant="body1" weight="bold">
                  {found.name}
                </Typography>
                <Typography
                  variant="caption1"
                  color="semantic.foreground.neutral.secondary"
                >
                  @{found.handle}
                </Typography>
              </div>
            </div>
            {stop ? (
              <div className="start-card-actions">
                <Typography
                  variant="caption1"
                  color="semantic.foreground.neutral.secondary"
                >
                  {stop.text}
                </Typography>
                {stop.link ? (
                  <Button
                    size="small"
                    variant="outlined"
                    color="assistive"
                    onClick={stop.link.onClick}
                  >
                    {stop.link.label}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </article>

          {stop ? null : (
            <>
              <section className="start-section">
                <Typography variant="body2" weight="bold">
                  {T.typeLabel}
                </Typography>
                <RadioGroup
                  value={memberType}
                  onValueChange={(v) =>
                    setMemberType(v === 'GUEST' ? 'GUEST' : 'REGULAR')
                  }
                >
                  <div className="member-radio">
                    <RadioGroupItem value="REGULAR" aria-label={T.regular} />
                    <Typography variant="body1">{T.regular}</Typography>
                  </div>
                  <div className="member-radio">
                    <RadioGroupItem value="GUEST" aria-label={T.guest} />
                    <Typography variant="body1">{T.guest}</Typography>
                  </div>
                </RadioGroup>
                <Typography
                  variant="caption1"
                  color="semantic.foreground.neutral.secondary"
                >
                  {T.guestDescription}
                </Typography>
              </section>
              <Button
                size="large"
                loading={invite.isPending}
                disabled={invite.isPending}
                onClick={() => invite.mutate(found.handle)}
              >
                {T.invite}
              </Button>
            </>
          )}
        </>
      ) : null}
    </div>
  )
}

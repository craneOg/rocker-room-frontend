import { Avatar, Button, TextField, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { formatKstShort } from '../../shared/lib/time'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import { EmptyState, ErrorState, PageLoading } from '../../shared/ui/StateViews'
import { MemberPicker, PartSelect } from './teamBits'
import {
  confirmDialog,
  refreshTeams,
  teamNameError,
  usePartOptions,
  useTeamContext,
  useTeamWrite,
  type Pick,
} from './teamHooks'
import {
  addTeamMembers,
  briefOf,
  changeMemberPart,
  createTeam,
  getDefaultTeamName,
  getTeam,
  removeTeamMember,
  renameTeam,
  replaceLeader,
  teamKey,
  teamsKey,
  transitionTeam,
  type TeamDetail,
} from './teamApi'
import { TEAM_COPY as T } from './teamCopy'

/** TEAM-004: a member writes a team application (a DRAFT team), submits it and waits for the review. */
export function TeamApply() {
  const c = useTeamContext()
  const [params] = useSearchParams()
  const teamId = params.get('teamId')
  if (c.detail.isPending) return <PageLoading />
  const open =
    c.perf?.status === 'ACTIVE' &&
    c.policy?.teamApplicationState === 'OPEN' &&
    c.regular
  // A saved application stays readable (and its leader can still withdraw) after the window closes.
  if (teamId === null)
    return open ? (
      <ApplyNew c={c} />
    ) : (
      <div className="start" data-screen-id="TEAM-004">
        <EmptyState description={T.cannotApply} />
      </div>
    )
  return <ApplyEdit c={c} teamId={teamId} />
}

type Ctx = ReturnType<typeof useTeamContext>

/** The first save creates the team (the requester becomes a member and the leader automatically). */
function ApplyNew({ c }: { c: Ctx }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const optionsFor = usePartOptions(c.clubId)
  const defaultName = useQuery({
    queryKey: [...teamsKey(c.clubId, c.performanceId), 'default-name'],
    queryFn: () => getDefaultTeamName(c.clubId, c.performanceId),
    staleTime: Infinity,
  })
  const [typed, setTyped] = useState<string | null>(null)
  const [myPart, setMyPart] = useState<string | null>(null)
  const [others, setOthers] = useState<Pick[]>([])
  const [picking, setPicking] = useState(false)
  const [nameError, setNameError] = useState<string | undefined>()
  const name = typed ?? defaultName.data ?? ''

  const save = useMutation({
    // The server makes the creator a member and the leader; listing them with a part sets it at once.
    mutationFn: () =>
      createTeam(c.clubId, c.performanceId, {
        name: name.trim(),
        members: [
          ...(c.myMembershipId === undefined
            ? []
            : [{ membershipId: c.myMembershipId, partId: myPart }]),
          ...others.map((m) => ({
            membershipId: m.membershipId,
            partId: m.partId,
          })),
        ],
      }),
    onSuccess: async (r) => {
      await refreshTeams(qc, c)
      feedback.toast(T.draftSaved, 'positive')
      void navigate(`${c.base}/teams/apply?teamId=${briefOf(r).id}`, {
        replace: true,
      })
    },
    onError: (e) => setNameError(teamNameError(e)),
  })

  if (defaultName.isPending && typed === null) return <PageLoading />
  return (
    <div className="start" data-screen-id="TEAM-004">
      <div className="team-banner">
        <Typography variant="body2">
          {T.statusDraft(
            c.policy?.teamApplicationDeadline
              ? formatKstShort(c.policy.teamApplicationDeadline)
              : null,
          )}
        </Typography>
      </div>
      <FormField label={T.nameLabel} error={nameError}>
        <TextField
          value={name}
          maxLength={100}
          aria-label={T.nameLabel}
          onChange={(e) => {
            setTyped(e.target.value)
            setNameError(undefined)
          }}
        />
      </FormField>
      <section className="perf-section" aria-label={T.sectionMembers}>
        <Typography variant="body1" weight="bold">
          {T.sectionMembers}
        </Typography>
        <div className="team-pick">
          <Typography variant="body2" weight="bold">
            {T.me}
          </Typography>
          <span className="perf-chip">{T.leaderBadge}</span>
          <PartSelect
            label={T.pickerPart(T.me)}
            value={myPart}
            options={optionsFor([])}
            onChange={setMyPart}
          />
        </div>
        {others.map((m) => (
          <div key={m.membershipId} className="team-pick">
            <Typography variant="body2">{m.name}</Typography>
            <PartSelect
              label={T.pickerPart(m.name)}
              value={m.partId}
              options={optionsFor(m.parts)}
              onChange={(partId) =>
                setOthers((list) =>
                  list.map((x) =>
                    x.membershipId === m.membershipId ? { ...x, partId } : x,
                  ),
                )
              }
            />
            <Button
              size="small"
              variant="outlined"
              color="assistive"
              onClick={() =>
                setOthers((list) =>
                  list.filter((x) => x.membershipId !== m.membershipId),
                )
              }
            >
              {T.removeMember}
            </Button>
          </div>
        ))}
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          onClick={() => setPicking(true)}
        >
          {`+ ${T.addMember}`}
        </Button>
      </section>
      <Button
        loading={save.isPending}
        disabled={name.trim() === ''}
        onClick={() => save.mutate()}
      >
        {T.saveDraft}
      </Button>
      {picking ? (
        <MemberPicker
          c={c}
          source="club"
          excluded={[
            ...others.map((m) => m.membershipId),
            c.myMembershipId ?? '',
          ]}
          onClose={() => setPicking(false)}
          onConfirm={(picks) => {
            setOthers((list) => [...list, ...picks])
            setPicking(false)
          }}
        />
      ) : null}
    </div>
  )
}

/** A saved application: editable while DRAFT, then submit / withdraw / reopen by status. */
function ApplyEdit({ c, teamId }: { c: Ctx; teamId: string }) {
  const optionsFor = usePartOptions(c.clubId)
  const write = useTeamWrite(c)
  const [typed, setTyped] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  const query = useQuery({
    queryKey: teamKey(c.clubId, c.performanceId, teamId),
    queryFn: () => getTeam(c.clubId, c.performanceId, teamId),
  })
  const d: TeamDetail | undefined = query.data
  if (query.isPending) return <PageLoading />
  if (!d)
    return (
      <div className="start" data-screen-id="TEAM-004">
        <ErrorState onRetry={() => void query.refetch()} />
      </div>
    )

  const { team, members } = d
  const iAmLeader = team.leaderMembershipId === c.myMembershipId
  // A finished performance keeps its applications as a record only.
  const draft =
    team.status === 'DRAFT' && iAmLeader && c.perf?.status !== 'FINISHED'
  const name = typed ?? team.name
  const call = {
    clubId: c.clubId,
    performanceId: c.performanceId,
    teamId: team.id,
  }
  const go = (
    action: 'submit' | 'unsubmit' | 'withdraw' | 'reopen',
    done: string,
  ) =>
    write.mutate({
      run: () =>
        transitionTeam(call.clubId, call.performanceId, call.teamId, action, {
          version: team.version,
        }),
      done,
    })

  const banner =
    team.status === 'DRAFT'
      ? T.statusDraft(
          c.policy?.teamApplicationDeadline
            ? formatKstShort(c.policy.teamApplicationDeadline)
            : null,
        )
      : team.status === 'SUBMITTED'
        ? T.statusSubmitted
        : team.status === 'REJECTED'
          ? T.statusRejected(team.rejectReason)
          : team.status === 'APPROVED'
            ? T.statusApproved
            : T.statusWithdrawn

  const saveDraft = () => {
    if (name.trim() === team.name) {
      feedback.toast(T.draftSaved, 'positive')
      return
    }
    write.mutate({
      run: () =>
        renameTeam(call.clubId, call.performanceId, call.teamId, {
          version: team.version,
          name: name.trim(),
        }),
      done: T.draftSaved,
      onDone: () => setTyped(null),
    })
  }

  const submit = async () => {
    if (
      await confirmDialog(
        T.submitTitle,
        `${T.submitBody} ${T.submitSummary(members.length, d.candidateSongs.length)}`,
        T.submit,
      )
    )
      go('submit', T.submitted)
  }

  const withdraw = async () => {
    if (
      await confirmDialog(
        T.withdrawApplyTitle,
        T.withdrawApplyBody,
        T.withdrawAction,
      )
    )
      go('withdraw', T.withdrawn)
  }

  const nameTaken = write.error ? teamNameError(write.error) : undefined
  const songsOpen = c.policy?.candidateState === 'OPEN'
  return (
    <div className="start" data-screen-id="TEAM-004">
      <div className="team-banner" role="status">
        <Typography variant="body2">{banner}</Typography>
      </div>

      {draft ? (
        <FormField label={T.nameLabel} error={nameTaken}>
          <TextField
            value={name}
            maxLength={100}
            aria-label={T.nameLabel}
            onChange={(e) => {
              setTyped(e.target.value)
              // The name error belongs to the text that was sent: editing it clears the error.
              if (write.error) write.reset()
            }}
          />
        </FormField>
      ) : (
        <Typography variant="title2" weight="bold">
          {team.name}
        </Typography>
      )}

      <section className="perf-section" aria-label={T.sectionMembers}>
        <Typography variant="body1" weight="bold">
          {T.sectionMembers}
        </Typography>
        <ul className="member-list">
          {members.map((m) => {
            const me = m.membershipId === c.myMembershipId
            return (
              <li key={m.id} className="team-row">
                <Avatar
                  size="medium"
                  src={m.profileImageUrl ?? undefined}
                  alt={m.displayName}
                />
                <div className="team-row-text">
                  <div className="team-row-line">
                    <Typography variant="body1" weight="bold">
                      {me ? T.me : m.displayName}
                    </Typography>
                    {m.isLeader ? (
                      <span className="perf-chip">{T.leaderBadge}</span>
                    ) : null}
                    {m.participationStatus === 'APPLIED' ? (
                      <span className="perf-chip">{T.willApply}</span>
                    ) : null}
                  </div>
                  {draft ? (
                    <PartSelect
                      label={T.pickerPart(m.displayName)}
                      value={m.partId}
                      options={optionsFor([])}
                      onChange={(partId) =>
                        !write.isPending &&
                        write.mutate({
                          run: () =>
                            changeMemberPart(
                              call.clubId,
                              call.performanceId,
                              call.teamId,
                              m.id,
                              { version: team.version, partId },
                            ),
                          done: T.partChanged,
                        })
                      }
                    />
                  ) : (
                    <Typography variant="caption1">
                      {m.partName ?? T.partNone}
                    </Typography>
                  )}
                </div>
                {draft && !me ? (
                  <details className="perf-menu">
                    <summary aria-label={`${m.displayName} ${T.rowMenu}`}>
                      {T.more}
                    </summary>
                    <button
                      type="button"
                      disabled={write.isPending}
                      onClick={() =>
                        write.mutate({
                          run: () =>
                            replaceLeader(
                              call.clubId,
                              call.performanceId,
                              call.teamId,
                              {
                                version: team.version,
                                leaderMembershipId: m.membershipId,
                              },
                            ),
                          done: T.leaderChanged,
                        })
                      }
                    >
                      {T.makeLeader}
                    </button>
                    <button
                      type="button"
                      disabled={write.isPending}
                      onClick={() =>
                        write.mutate({
                          run: () =>
                            removeTeamMember(
                              call.clubId,
                              call.performanceId,
                              call.teamId,
                              m.id,
                              { version: team.version },
                            ),
                          done: T.removed,
                        })
                      }
                    >
                      {T.removeMember}
                    </button>
                  </details>
                ) : null}
              </li>
            )
          })}
        </ul>
        {draft ? (
          <Button
            size="small"
            variant="outlined"
            color="assistive"
            onClick={() => setPicking(true)}
          >
            {`+ ${T.addMember}`}
          </Button>
        ) : null}
      </section>

      <section className="perf-section" aria-label={T.sectionApplySongs}>
        <Typography variant="body1" weight="bold">
          {T.sectionApplySongs}
        </Typography>
        {d.candidateSongs.length === 0 ? (
          <Typography variant="body2">{T.emptyApplySongs}</Typography>
        ) : (
          <ul className="perf-plain-list">
            {d.candidateSongs.map((s) => (
              <li key={s.id}>
                <Link className="perf-feature" to={`${c.base}/songs/${s.id}`}>
                  <Typography variant="body2" weight="bold">
                    {s.title}
                  </Typography>
                  <Typography variant="caption1">{s.artist ?? ''}</Typography>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {draft ? (
          songsOpen ? (
            <Link to={`${c.base}/songs/new?teamId=${team.id}`}>
              {`+ ${T.addSong}`}
            </Link>
          ) : (
            <Typography variant="caption1">{T.songsClosed}</Typography>
          )
        ) : null}
      </section>

      {iAmLeader ? (
        <div className="team-actions">
          {draft ? (
            <>
              <Button
                variant="outlined"
                color="assistive"
                loading={write.isPending}
                onClick={saveDraft}
              >
                {T.saveDraft}
              </Button>
              <Button
                // The submit request carries no name: an unsaved edit would be dropped.
                disabled={
                  name.trim() === '' ||
                  name.trim() !== team.name ||
                  write.isPending
                }
                onClick={() => void submit()}
              >
                {T.submit}
              </Button>
              <Button
                variant="outlined"
                color="assistive"
                loading={write.isPending}
                onClick={() => void withdraw()}
              >
                {T.deleteDraft}
              </Button>
            </>
          ) : null}
          {team.status === 'SUBMITTED' ? (
            <>
              <Button
                variant="outlined"
                color="assistive"
                loading={write.isPending}
                onClick={() => go('unsubmit', T.unsubmitted)}
              >
                {T.unsubmit}
              </Button>
              <Button loading={write.isPending} onClick={() => void withdraw()}>
                {T.withdrawApply}
              </Button>
            </>
          ) : null}
          {(team.status === 'REJECTED' || team.status === 'WITHDRAWN') &&
          c.perf?.status === 'ACTIVE' ? (
            <Button
              loading={write.isPending}
              onClick={() => go('reopen', T.reopened)}
            >
              {T.menuReopen}
            </Button>
          ) : null}
        </div>
      ) : null}

      {picking ? (
        <MemberPicker
          c={c}
          source="club"
          excluded={members.map((m) => m.membershipId)}
          loading={write.isPending}
          onClose={() => setPicking(false)}
          onConfirm={(picks) =>
            write.mutate({
              run: () =>
                addTeamMembers(
                  call.clubId,
                  call.performanceId,
                  call.teamId,
                  team.version,
                  picks,
                ),
              done: T.memberAdded(picks.length),
              onDone: () => setPicking(false),
              // Members are added one by one: after a half-way failure the picker starts over.
              onFail: () => setPicking(false),
            })
          }
        />
      ) : null}
    </div>
  )
}

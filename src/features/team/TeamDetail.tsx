import { Avatar, TextField, Typography } from '@montage-ui/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '../../shared/ui/Badge'
import { feedback } from '../../shared/ui/feedbackBus'
import { ErrorState, ListSkeleton } from '../../shared/ui/StateViews'
import { ActionModal } from '../club/ManageBits'
import { MemberPicker, PartSelect, TeamBadges } from './teamBits'
import {
  confirmDialog,
  usePartOptions,
  useReasonGate,
  useTeamContext,
  useTeamWrite,
  type Pick,
  type PartOption,
} from './teamHooks'
import {
  addTeamMember,
  changeMemberPart,
  getTeam,
  listTeams,
  removeTeamMember,
  renameTeam,
  replaceLeader,
  setDefaultTeam,
  teamKey,
  teamsKey,
  transitionTeam,
  versionOf,
  type TeamMemberRow,
} from './teamApi'
import { TEAM_COPY as T } from './teamCopy'

/** TEAM-002: members, parts, assigned and candidate songs. Officers (and a draft's leader) edit. */
export function TeamDetail() {
  const c = useTeamContext()
  const gate = useReasonGate()
  const teamId = c.teamId ?? ''
  const { clubId, performanceId } = c

  const query = useQuery({
    queryKey: teamKey(clubId, performanceId, teamId),
    queryFn: () => getTeam(clubId, performanceId, teamId),
  })
  const optionsFor = usePartOptions(c.clubId)
  // The team the default flag moves away from (1-2); shares the TEAM-001 list cache.
  const all = useQuery({
    queryKey: [...teamsKey(clubId, performanceId), 'list', 'all'],
    queryFn: ({ signal }) => listTeams(clubId, performanceId, {}, signal),
    enabled: c.admin && c.isBand,
  })
  const currentDefault = all.data?.items.find((t) => t.isDefault)?.name ?? null

  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [partFor, setPartFor] = useState<TeamMemberRow | null>(null)
  const [partId, setPartId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<TeamMemberRow | null>(null)
  const [removeSessions, setRemoveSessions] = useState(false)

  const write = useTeamWrite(c)

  const d = query.data
  if (query.isPending || !c.perf)
    return (
      <div className="start" data-screen-id="TEAM-002">
        {query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : (
          <ListSkeleton />
        )}
      </div>
    )
  if (!d)
    return (
      <div className="start" data-screen-id="TEAM-002">
        <ErrorState onRetry={() => void query.refetch()} />
      </div>
    )

  const { team, members } = d
  const perfStatus = c.perf.status
  const locked = perfStatus === 'LOCKED'
  const active = perfStatus === 'ACTIVE'
  const iAmLeader =
    c.myMembershipId !== undefined &&
    team.leaderMembershipId === c.myMembershipId
  const isMember = members.some((m) => m.membershipId === c.myMembershipId)
  // Officers edit while the performance lives on (LOCKED needs a reason); a leader edits own DRAFT team (API-064 ~ 068).
  const canEdit =
    (c.admin && (perfStatus === 'DRAFT' || active || locked)) ||
    (iAmLeader && team.status === 'DRAFT' && active)
  const canReopen =
    (c.admin || iAmLeader) &&
    active &&
    (team.status === 'REJECTED' || team.status === 'WITHDRAWN')
  const reasonForEdit = c.admin && locked

  /** Runs an edit; on a LOCKED performance an officer gives a reason first (2-2). */
  const edit = (
    call: (reason: string | undefined) => Promise<unknown>,
    done: string,
    onDone?: () => void,
  ) =>
    gate.ask(reasonForEdit, {
      title: T.lockedTitle,
      description: T.lockedHint,
      actionLabel: T.lockedAction,
      run: (reason) => write.mutate({ run: () => call(reason), done, onDone }),
    })

  const defaultTeam = async () => {
    if (
      await confirmDialog(
        T.setDefaultTitle,
        T.setDefaultBody(team.name, currentDefault),
        T.setDefaultAction,
      )
    )
      write.mutate({
        run: () => setDefaultTeam(clubId, performanceId, team.id),
        done: T.defaultSet,
      })
  }

  const withdraw = (
    title: string,
    body: string,
    action: string,
    done: string,
  ) =>
    gate.ask(true, {
      title,
      description: body,
      actionLabel: action,
      run: (reason) =>
        write.mutate({
          run: () =>
            transitionTeam(clubId, performanceId, team.id, 'withdraw', {
              version: team.version,
              reason,
            }),
          done,
        }),
    })

  const addPicks = (picks: Pick[]) =>
    edit(
      async (reason) => {
        // Every write bumps the team version: the next one carries the answer's.
        let version = team.version
        for (const p of picks)
          version = versionOf(
            await addTeamMember(clubId, performanceId, team.id, {
              version,
              membershipId: p.membershipId,
              partId: p.partId,
              reason,
            }),
          )
      },
      T.memberAdded(picks.length),
      () => setAdding(false),
    )

  const menu: [string, () => void][] = []
  if (canEdit)
    menu.push([
      T.menuRename,
      () => {
        setName(team.name)
        setRenaming(true)
      },
    ])
  if (c.admin && c.isBand && team.status === 'APPROVED' && !team.isDefault)
    menu.push([T.menuSetDefault, () => void defaultTeam()])
  if (canReopen)
    menu.push([
      T.menuReopen,
      () =>
        write.mutate({
          run: () =>
            transitionTeam(clubId, performanceId, team.id, 'reopen', {
              version: team.version,
            }),
          done: T.reopened,
        }),
    ])
  if (c.admin && active && team.status === 'APPROVED')
    menu.push([
      T.menuDisband,
      () =>
        withdraw(T.disbandTitle, T.disbandBody, T.disbandAction, T.disbanded),
    ])
  if (
    c.admin &&
    active &&
    (team.status === 'DRAFT' || team.status === 'SUBMITTED')
  )
    menu.push([
      T.menuWithdraw,
      () =>
        withdraw(
          T.withdrawTitle,
          T.withdrawBody,
          T.withdrawAction,
          T.withdrawn,
        ),
    ])
  const reviewable =
    c.admin && team.status === 'SUBMITTED' && team.source === 'SELF' && active

  const maxCount = Math.max(1, ...team.partSummary.map((p) => p.count))
  // ponytail: the member's own registered parts are not in API-063, so every active part is offered.
  const partChoices: PartOption[] = optionsFor([])
  const rowMenu = (m: TeamMemberRow) => {
    const items: [string, () => void][] = [
      [
        T.changePart,
        () => {
          setPartFor(m)
          setPartId(m.partId)
        },
      ],
    ]
    if (!m.isLeader)
      items.push([
        T.makeLeader,
        () =>
          edit(
            (reason) =>
              replaceLeader(clubId, performanceId, team.id, {
                version: team.version,
                leaderMembershipId: m.membershipId,
                reason,
              }),
            T.leaderChanged,
          ),
      ])
    else if (c.admin)
      items.push([
        T.clearLeader,
        () =>
          edit(
            (reason) =>
              replaceLeader(clubId, performanceId, team.id, {
                version: team.version,
                leaderMembershipId: null,
                reason,
              }),
            T.leaderChanged,
          ),
      ])
    items.push([
      T.removeMember,
      () => {
        // T-10: the leader goes only after another member takes over.
        if (m.isLeader)
          void feedback.dialog({
            title: T.leaderFirst,
            confirmLabel: T.confirm,
          })
        else {
          setRemoveSessions(false)
          setRemoving(m)
        }
      },
    ])
    return items
  }

  return (
    <div className="start" data-screen-id="TEAM-002">
      <section className="perf-header">
        <div className="perf-chips">
          <Typography variant="title2" weight="bold">
            {team.name}
          </Typography>
          <TeamBadges team={team} />
          <span className="perf-chip">
            {T.sourceLabel[team.source] ?? team.source}
          </span>
        </div>
        {team.status === 'REJECTED' && team.rejectReason ? (
          <Typography
            variant="body2"
            color="semantic.foreground.neutral.secondary"
          >
            {T.rejectReason(team.rejectReason)}
          </Typography>
        ) : null}
        {menu.length > 0 || reviewable ? (
          <details className="perf-menu">
            <summary aria-label={T.teamMenu}>{T.more}</summary>
            {menu.map(([label, run]) => (
              <button key={label} type="button" onClick={run}>
                {label}
              </button>
            ))}
            {reviewable ? (
              <Link to={`${c.base}/teams/review`}>{T.menuReview}</Link>
            ) : null}
          </details>
        ) : null}
      </section>

      <section className="perf-section" aria-label={T.sectionMembers}>
        <Typography variant="body1" weight="bold">
          {T.sectionMembers}
        </Typography>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id} className="team-row">
              <Avatar
                size="medium"
                src={m.profileImageUrl ?? undefined}
                alt={m.displayName}
              />
              <div className="team-row-text">
                <div className="team-row-line">
                  <Typography variant="body1" weight="bold">
                    {m.displayName}
                  </Typography>
                  {m.isLeader ? (
                    <span className="perf-chip">{T.leaderBadge}</span>
                  ) : null}
                  {m.participationStatus === 'APPLIED' ? (
                    <Badge kind="participation" value="APPLIED" />
                  ) : null}
                </div>
                <div className="team-row-line">
                  <Typography variant="caption1">
                    {m.partName ?? T.partNone}
                  </Typography>
                  {m.partId !== null && !m.isRegisteredPart ? (
                    <span className="perf-chip">{T.notRegisteredPart}</span>
                  ) : null}
                </div>
              </div>
              {canEdit ? (
                <details className="perf-menu">
                  <summary aria-label={`${m.displayName} ${T.rowMenu}`}>
                    {T.more}
                  </summary>
                  {rowMenu(m).map(([label, run]) => (
                    <button key={label} type="button" onClick={run}>
                      {label}
                    </button>
                  ))}
                </details>
              ) : null}
            </li>
          ))}
        </ul>
        {canEdit ? (
          <div className="team-actions">
            <button
              type="button"
              className="perf-fab"
              onClick={() => setAdding(true)}
            >
              {`+ ${T.addMember}`}
            </button>
          </div>
        ) : null}
      </section>

      <section className="perf-section" aria-label={T.sectionParts}>
        <Typography variant="body1" weight="bold">
          {T.sectionParts}
        </Typography>
        {team.partSummary.map((p) => (
          <div key={p.partId ?? 'none'} className="team-bar">
            <Typography variant="caption1">
              {p.partName ?? T.partNone}
            </Typography>
            <div
              className="team-bar-fill"
              style={{ width: `${(p.count / maxCount) * 60}%` }}
              role="img"
              aria-label={`${p.partName ?? T.partNone} ${p.count}`}
            />
            <Typography variant="caption1">{p.count}</Typography>
          </div>
        ))}
      </section>

      <section className="perf-section" aria-label={T.sectionSongs}>
        <Typography variant="body1" weight="bold">
          {T.sectionSongs}
        </Typography>
        {d.songs.length === 0 ? (
          <Typography variant="body2">{T.emptySongs}</Typography>
        ) : (
          <ul className="perf-plain-list">
            {d.songs.map((s) => (
              <li key={s.id}>
                <Link className="perf-feature" to={`${c.base}/songs/${s.id}`}>
                  {s.setlistOrder !== null ? (
                    <Typography variant="caption1">{`${s.setlistOrder}.`}</Typography>
                  ) : null}
                  <Typography variant="body2" weight="bold">
                    {s.title}
                  </Typography>
                  <Typography variant="caption1">{s.artist ?? ''}</Typography>
                  <Typography variant="caption1">
                    {T.sessions(s.sessionCount ?? 0)}
                  </Typography>
                  {s.requirementsSatisfied === null ||
                  s.requirementsSatisfied === undefined ? null : (
                    <span className="perf-chip">
                      {s.requirementsSatisfied ? T.satisfied : T.unsatisfied}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="perf-section" aria-label={T.sectionCandidates}>
        <Typography variant="body1" weight="bold">
          {T.sectionCandidates}
        </Typography>
        {d.candidateSongs.length === 0 ? (
          <Typography variant="body2">{T.emptyCandidates}</Typography>
        ) : (
          <ul className="perf-plain-list">
            {d.candidateSongs.map((s) => (
              <li key={s.id}>
                <Link className="perf-feature" to={`${c.base}/songs/${s.id}`}>
                  <Typography variant="body2" weight="bold">
                    {s.title}
                  </Typography>
                  <Badge kind="song" value={s.status} />
                  {s.evaluation ? (
                    <Typography variant="caption1">
                      {T.voteSummary(s.evaluation.voteCount)}
                    </Typography>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {(isMember || c.admin) && c.policy?.candidateState === 'OPEN' ? (
          <Link to={`${c.base}/songs/new?teamId=${team.id}`}>
            {`+ ${T.proposeSong}`}
          </Link>
        ) : null}
      </section>

      <section className="perf-section" aria-label={T.sectionSchedules}>
        <Typography variant="body1" weight="bold">
          {T.sectionSchedules}
        </Typography>
        <Link to={`${c.base}/schedules?teamId=${team.id}`}>
          {T.allSchedules}
        </Link>
      </section>

      {isMember || c.admin ? (
        <Link to={`${c.base}/availability/common?teamId=${team.id}`}>
          {T.availability}
        </Link>
      ) : null}

      {renaming ? (
        <ActionModal
          open
          title={T.renameTitle}
          actionLabel={T.save}
          loading={write.isPending}
          actionDisabled={name.trim() === '' || name.trim() === team.name}
          onClose={() => setRenaming(false)}
          onSubmit={() =>
            edit(
              (reason) =>
                renameTeam(clubId, performanceId, team.id, {
                  version: team.version,
                  name: name.trim(),
                  reason,
                }),
              T.renamed,
              () => setRenaming(false),
            )
          }
        >
          <TextField
            value={name}
            aria-label={T.nameLabel}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </ActionModal>
      ) : null}

      {partFor ? (
        <ActionModal
          open
          title={T.partPickTitle(partFor.displayName)}
          actionLabel={T.save}
          loading={write.isPending}
          onClose={() => setPartFor(null)}
          onSubmit={() =>
            edit(
              (reason) =>
                changeMemberPart(clubId, performanceId, team.id, partFor.id, {
                  version: team.version,
                  partId,
                  reason,
                }),
              T.partChanged,
              () => setPartFor(null),
            )
          }
        >
          <PartSelect
            label={T.pickerPart(partFor.displayName)}
            value={partId}
            options={partChoices}
            onChange={setPartId}
          />
        </ActionModal>
      ) : null}

      {removing ? (
        <ActionModal
          open
          title={T.removeTitle(removing.displayName)}
          actionLabel={T.removeAction}
          loading={write.isPending}
          onClose={() => setRemoving(null)}
          onSubmit={() =>
            edit(
              (reason) =>
                removeTeamMember(clubId, performanceId, team.id, removing.id, {
                  version: team.version,
                  removeSessions,
                  reason,
                }),
              T.removed,
              () => setRemoving(null),
            )
          }
        >
          <label className="choice-row">
            <input
              type="checkbox"
              checked={removeSessions}
              onChange={(e) => setRemoveSessions(e.target.checked)}
            />
            <Typography variant="body2">{T.removeSessions}</Typography>
          </label>
        </ActionModal>
      ) : null}

      {adding ? (
        <MemberPicker
          c={c}
          source={c.admin ? 'participants' : 'club'}
          excluded={members.map((m) => m.membershipId)}
          loading={write.isPending}
          onClose={() => setAdding(false)}
          onConfirm={addPicks}
        />
      ) : null}
      {gate.node}
    </div>
  )
}

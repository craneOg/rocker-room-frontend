import { Button, TextField, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import { EmptyState, PageLoading } from '../../shared/ui/StateViews'
import { MemberPicker, PartSelect } from './teamBits'
import {
  refreshTeams,
  usePartOptions,
  useTeamContext,
  teamNameError,
  type Pick,
} from './teamHooks'
import { briefOf, createTeam, getDefaultTeamName, teamsKey } from './teamApi'
import { TEAM_COPY as T } from './teamCopy'

/** TEAM-003: an officer makes an approved team with members and a leader in one request (API-062). */
export function TeamCreate() {
  const c = useTeamContext()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const optionsFor = usePartOptions(c.clubId)

  const defaultName = useQuery({
    queryKey: [...teamsKey(c.clubId, c.performanceId), 'default-name'],
    queryFn: () => getDefaultTeamName(c.clubId, c.performanceId),
    // A name once offered is not re-offered under the user's hands.
    staleTime: Infinity,
  })
  const [typed, setTyped] = useState<string | null>(null)
  const [members, setMembers] = useState<Pick[]>([])
  const [leader, setLeader] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [nameError, setNameError] = useState<string | undefined>()

  const name = typed ?? defaultName.data ?? ''

  const create = useMutation({
    mutationFn: () =>
      createTeam(c.clubId, c.performanceId, {
        name: name.trim(),
        members: members.map((m) => ({
          membershipId: m.membershipId,
          partId: m.partId,
        })),
        ...(leader === null ? {} : { leaderMembershipId: leader }),
      }),
    onSuccess: async (r) => {
      await refreshTeams(qc, c)
      feedback.toast(T.created, 'positive')
      void navigate(`${c.base}/teams/${briefOf(r).id}`)
    },
    onError: (e) => setNameError(teamNameError(e)),
  })

  if (c.detail.isPending || (defaultName.isPending && typed === null))
    return <PageLoading />
  const status = c.perf?.status
  if (status !== 'DRAFT' && status !== 'ACTIVE')
    return (
      <div className="start" data-screen-id="TEAM-003">
        <EmptyState description={T.cannotCreate} />
      </div>
    )

  const trimmed = name.trim()
  return (
    <div className="start" data-screen-id="TEAM-003">
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
        <div
          className="choice-list"
          role="radiogroup"
          aria-label={T.leaderField}
        >
          <label className="choice-row">
            <input
              type="radio"
              name="leader"
              checked={leader === null}
              onChange={() => setLeader(null)}
            />
            <Typography variant="body2">{T.noLeader}</Typography>
          </label>
          {members.map((m) => (
            <div key={m.membershipId} className="team-pick">
              <label className="choice-row">
                <input
                  type="radio"
                  name="leader"
                  checked={leader === m.membershipId}
                  onChange={() => setLeader(m.membershipId)}
                />
                <Typography variant="body2">{m.name}</Typography>
              </label>
              <PartSelect
                label={T.pickerPart(m.name)}
                value={m.partId}
                options={optionsFor(m.parts)}
                onChange={(partId) =>
                  setMembers((list) =>
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
                onClick={() => {
                  setMembers((list) =>
                    list.filter((x) => x.membershipId !== m.membershipId),
                  )
                  if (leader === m.membershipId) setLeader(null)
                }}
              >
                {T.removeMember}
              </Button>
            </div>
          ))}
        </div>
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
        loading={create.isPending}
        disabled={trimmed === ''}
        onClick={() => create.mutate()}
      >
        {T.create}
      </Button>

      {picking ? (
        <MemberPicker
          c={c}
          source="participants"
          excluded={members.map((m) => m.membershipId)}
          onClose={() => setPicking(false)}
          onConfirm={(picks) => {
            setMembers((list) => [...list, ...picks])
            setPicking(false)
          }}
        />
      ) : null}
    </div>
  )
}

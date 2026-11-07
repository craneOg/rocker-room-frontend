import { Button, Switch, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { useSession } from '../../shared/auth/session'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { ListSkeleton } from '../../shared/ui/StateViews'
import {
  disableJoinCode,
  getClubSettings,
  getJoinCode,
  regenerateJoinCode,
  setSearchable,
  type ClubSettings,
  type JoinCodeInfo,
} from './settingsApi'
import { SETTINGS_COPY as T } from './settingsCopy'
import { LoadError } from './SettingsViews'

/** CLUB-106: show and re-issue the join code, and switch search visibility (officers only). */
export function JoinCodeSettings() {
  const { clubId = '' } = useParams()
  const queryClient = useQueryClient()
  const clubName =
    useSession().memberships.find((m) => m.clubId === clubId)?.club.name ?? ''
  const codeKey = ['club', clubId, 'join-code']
  const settingsKey = ['club', clubId, 'settings']

  const code = useQuery({
    queryKey: codeKey,
    queryFn: () => getJoinCode(clubId),
  })
  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: () => getClubSettings(clubId),
  })

  const issue = useMutation({
    mutationFn: () => regenerateJoinCode(clubId),
    onSuccess: ({ joinCode }) => {
      queryClient.setQueryData<JoinCodeInfo>(codeKey, { joinCode })
      feedback.toast(T.regenerated)
    },
  })
  const turnOff = useMutation({
    mutationFn: () => disableJoinCode(clubId),
    onSuccess: () =>
      queryClient.setQueryData<JoinCodeInfo>(codeKey, { joinCode: null }),
  })
  const searchable = useMutation({
    mutationFn: (value: boolean) => setSearchable(clubId, value),
    onSuccess: (club) => {
      queryClient.setQueryData<ClubSettings>(settingsKey, club)
      feedback.toast(COPY.saved)
    },
  })

  const regenerate = async () => {
    const choice = await feedback.dialog({
      title: T.regenerateTitle,
      description: T.regenerateDescription,
      cancelLabel: T.cancel,
      confirmLabel: T.regenerate,
      danger: true,
    })
    if (choice === 'confirm') issue.mutate()
  }

  const toggleCode = async (on: boolean) => {
    // Switching on needs no confirmation: it only issues a fresh code.
    if (on) return issue.mutate()
    const choice = await feedback.dialog({
      title: T.disableTitle,
      description: T.disableDescription,
      cancelLabel: T.cancel,
      confirmLabel: T.disable,
      danger: true,
    })
    if (choice === 'confirm') turnOff.mutate()
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      feedback.toast(T.copied)
    } catch {
      feedback.toast(COPY.unknownError, 'negative')
    }
  }

  const retry = () => {
    void code.refetch()
    void settings.refetch()
  }

  let body
  if (code.isError || settings.isError) {
    body = <LoadError onRetry={retry} />
  } else if (!code.data || !settings.data) {
    body = <ListSkeleton rows={3} />
  } else {
    const joinCode = code.data.joinCode
    const link = `${location.origin}/join/${joinCode}`
    const busy = issue.isPending || turnOff.isPending
    body = (
      <>
        <section className="start-section">
          <Typography variant="body1" weight="bold" as="h2">
            {T.codeSection}
          </Typography>
          {joinCode ? (
            <>
              <Typography variant="title1" weight="bold" className="join-code">
                {joinCode}
              </Typography>
              <Button size="large" onClick={() => void copy(link)}>
                {T.copyLink}
              </Button>
              <div className="start-card-actions">
                <Button
                  size="small"
                  variant="outlined"
                  color="assistive"
                  onClick={() => void copy(joinCode)}
                >
                  {T.copyCode}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="assistive"
                  onClick={() =>
                    void copy(T.inviteText(clubName, joinCode, link))
                  }
                >
                  {T.copyInvite}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="assistive"
                  disabled={busy}
                  onClick={() => void regenerate()}
                >
                  {T.regenerate}
                </Button>
              </div>
              <Typography
                variant="caption1"
                color="semantic.foreground.neutral.secondary"
              >
                {T.codeHint}
              </Typography>
            </>
          ) : (
            <Typography
              variant="body2"
              color="semantic.foreground.neutral.secondary"
            >
              {T.codeOff}
            </Typography>
          )}
        </section>

        <section className="start-card">
          <Typography variant="body1" weight="bold">
            {T.codeToggle}
          </Typography>
          <Switch
            aria-label={T.codeToggle}
            checked={joinCode !== null}
            disabled={busy}
            onCheckedChange={(on) => void toggleCode(on)}
          />
        </section>

        <section className="start-card">
          <div className="start-card-text">
            <Typography variant="body1" weight="bold">
              {T.searchableToggle}
            </Typography>
            <Typography
              variant="caption1"
              color="semantic.foreground.neutral.secondary"
            >
              {settings.data.isSearchable ? T.searchableOn : T.searchableOff}
            </Typography>
          </div>
          <Switch
            aria-label={T.searchableToggle}
            checked={settings.data.isSearchable}
            disabled={searchable.isPending}
            onCheckedChange={(on) => searchable.mutate(on)}
          />
        </section>
      </>
    )
  }

  return (
    <div className="start" data-screen-id="CLUB-106">
      <Typography variant="title2" weight="bold" as="h1">
        {T.codeTitle}
      </Typography>
      {body}
    </div>
  )
}

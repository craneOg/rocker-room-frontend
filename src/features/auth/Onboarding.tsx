import {
  Button,
  IconButton,
  TextField,
  TextFieldContent,
  Typography,
} from '@montage-ui/core'
import { IconClose } from '@montage-ui/icon'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { setSignedIn } from '../../shared/api/client'
import { fieldErrors } from '../../shared/api/errors'
import { useSession } from '../../shared/auth/session'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import { checkHandle, logout, saveProfile } from './api'
import { AUTH_COPY as T } from './copy'

// Screen spec and ERD v7: 5~30 (the older API table says 3, ignored).
const HANDLE_PATTERN = /^[a-z0-9_]{5,30}$/
const HANDLE_DEBOUNCE_MS = 400

function useDebounced<V>(value: V, ms: number): V {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** AUTH-002: name + handle. Photo upload and the action sheet are not built (image store undecided). */
export function Onboarding() {
  const { me } = useSession()
  const queryClient = useQueryClient()
  const [name, setName] = useState(me?.name ?? '')
  const [nameTouched, setNameTouched] = useState(false)
  const [handle, setHandle] = useState('')

  const trimmed = name.trim()
  const nameValid = trimmed.length >= 1 && trimmed.length <= 50
  const handleValid = HANDLE_PATTERN.test(handle)

  // Keyed by the handle itself, so a late response for an old input can never show for a new one.
  const debounced = useDebounced(handle, HANDLE_DEBOUNCE_MS)
  const availability = useQuery({
    queryKey: ['handle-availability', debounced],
    queryFn: ({ signal }) => checkHandle(debounced, signal),
    enabled: handleValid && debounced === handle,
    staleTime: 0,
  })
  const checking =
    handleValid &&
    !availability.isError &&
    (debounced !== handle || availability.isFetching)
  const available =
    handleValid && !checking && availability.data?.available === true
  const taken =
    handleValid && !checking && availability.data?.available === false

  const save = useMutation({
    mutationFn: saveProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })
  const leave = useMutation({
    mutationFn: logout,
    // The session query now answers 401 (expected, not an expiry); RequireAuth sends us to `/`.
    onSuccess: async () => {
      setSignedIn(false)
      await queryClient.resetQueries()
    },
  })
  const serverErrors = fieldErrors(save.error)

  const onClose = async () => {
    const choice = await feedback.dialog({
      title: T.leaveTitle,
      description: T.leaveDescription,
      cancelLabel: T.keepWriting,
      confirmLabel: T.leave,
    })
    if (choice === 'confirm') leave.mutate()
  }

  const handleError =
    handle && !handleValid
      ? T.handleError
      : taken
        ? T.handleTaken
        : serverErrors.handle

  // Decided from the session, not component state: the full shell remounts this screen once saved.
  if (me && !me.onboardingRequired) return <Navigate to="/start" replace />

  return (
    <form
      className="onboarding"
      data-screen-id="AUTH-002"
      onSubmit={(e) => {
        e.preventDefault()
        if (nameValid && available && !save.isPending)
          save.mutate({ name: trimmed, handle })
      }}
    >
      <header className="onboarding-top">
        <div>
          <Typography variant="title2" weight="bold" as="h1">
            {T.profileTitle}
          </Typography>
          <Typography
            variant="body2"
            color="semantic.foreground.neutral.secondary"
          >
            {T.profileSubtitle}
          </Typography>
        </div>
        <IconButton
          type="button"
          aria-label={COPY.close}
          size="xlarge"
          onClick={() => void onClose()}
        >
          <IconClose />
        </IconButton>
      </header>

      <div className="profile-photo" role="img" aria-label={T.profilePhoto}>
        {me?.profileImageUrl ? (
          <img src={me.profileImageUrl} alt="" />
        ) : (
          <span>{trimmed.charAt(0)}</span>
        )}
      </div>

      <FormField
        label={T.name}
        error={nameTouched && !nameValid ? T.nameError : serverErrors.name}
        hint={T.nameHint}
      >
        <TextField
          value={name}
          placeholder={T.namePlaceholder}
          status={nameTouched && !nameValid ? 'negative' : 'normal'}
          onChange={(e) => {
            setName(e.target.value)
            setNameTouched(true)
            save.reset()
          }}
        />
      </FormField>

      <FormField
        label={T.handle}
        error={handleError}
        success={available ? T.handleAvailable : undefined}
        hint={checking ? T.handleChecking : T.handleHint}
      >
        <TextField
          value={handle}
          placeholder={T.handlePlaceholder}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          status={handleError ? 'negative' : 'normal'}
          leadingContent={<TextFieldContent variant="text">@</TextFieldContent>}
          onChange={(e) => {
            setHandle(e.target.value)
            save.reset()
          }}
        />
      </FormField>

      <Button
        type="submit"
        size="large"
        fullWidth
        loading={save.isPending}
        disabled={!nameValid || !available}
      >
        {T.submit}
      </Button>
    </form>
  )
}

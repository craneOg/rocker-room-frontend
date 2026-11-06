import {
  Button,
  Checkbox,
  IconButton,
  TextField,
  TextFieldContent,
  Typography,
} from '@montage-ui/core'
import { IconClose } from '@montage-ui/icon'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate } from 'react-router'
import { setSignedIn } from '../../shared/api/client'
import { ApiError, fieldErrors } from '../../shared/api/errors'
import { useSession } from '../../shared/auth/session'
import { inviteOr } from '../../shared/lib/pendingInvite'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import { logout, saveProfile } from './api'
import { AUTH_COPY as T } from './copy'
import { isNameValid, useHandleAvailability } from './useHandleAvailability'

/** AUTH-002: name + handle. Photo upload and the action sheet are not built (image store undecided). */
export function Onboarding() {
  const { me } = useSession()
  const queryClient = useQueryClient()
  const [name, setName] = useState(me?.name ?? '')
  const [nameTouched, setNameTouched] = useState(false)
  const [handle, setHandle] = useState('')
  // Consent is client-side only: the server stores no consent time (D-1), so it never enters the request.
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [agreedPrivacy, setAgreedPrivacy] = useState(false)
  const agreed = agreedTerms && agreedPrivacy

  const trimmed = name.trim()
  const nameValid = isNameValid(trimmed)
  const { handleValid, checking, available, taken } =
    useHandleAvailability(handle)

  const save = useMutation({
    mutationFn: saveProfile,
    // Seed the cache with the saved profile first: if the refetch then fails, the
    // session still sees onboardingRequired: false and leaves this screen.
    onSuccess: (saved) => {
      queryClient.setQueryData(['me'], saved)
      return queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
  const leave = useMutation({
    mutationFn: logout,
    // The session query now answers 401 (expected, not an expiry); RequireAuth sends us to `/`.
    onSuccess: async () => {
      setSignedIn(false)
      await queryClient.resetQueries()
    },
  })
  // Show a server field error only while the field still holds the value that was submitted.
  const submitted = fieldErrors(save.error)
  const serverErrors = {
    name: save.variables?.name === trimmed ? submitted.name : undefined,
    handle: save.variables?.handle === handle ? submitted.handle : undefined,
  }
  // AUTH-002: someone took the ID between the check and the save (409 DUPLICATE).
  const takenOnSave =
    save.error instanceof ApiError &&
    save.error.code === 'DUPLICATE' &&
    save.variables?.handle === handle

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
      : taken || takenOnSave
        ? T.handleTaken
        : serverErrors.handle

  // Decided from the session, not component state: the full shell remounts this screen once saved.
  if (me && !me.onboardingRequired)
    return <Navigate to={inviteOr('/start')} replace />

  return (
    <form
      className="onboarding"
      data-screen-id="AUTH-002"
      onSubmit={(e) => {
        e.preventDefault()
        if (nameValid && available && agreed && !save.isPending)
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
            // Only reset on error: resetting while isPending would re-enable
            // the submit button mid-flight and allow a duplicate save.
            if (save.isError) save.reset()
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
            // Same guard as the name field: preserve isPending during a save.
            if (save.isError) save.reset()
          }}
        />
      </FormField>

      {/* Terms links have no target yet: plain text (same as AUTH-001 and MY). */}
      <div className="onboarding-terms">
        <label>
          <Checkbox
            aria-label={T.agreeTerms}
            checked={agreedTerms}
            onCheckedChange={setAgreedTerms}
          />
          <Typography variant="body2">{T.agreeTerms}</Typography>
        </label>
        <label>
          <Checkbox
            aria-label={T.agreePrivacy}
            checked={agreedPrivacy}
            onCheckedChange={setAgreedPrivacy}
          />
          <Typography variant="body2">{T.agreePrivacy}</Typography>
        </label>
      </div>

      <Button
        type="submit"
        size="large"
        fullWidth
        loading={save.isPending}
        disabled={!nameValid || !available || !agreed}
      >
        {T.submit}
      </Button>
    </form>
  )
}

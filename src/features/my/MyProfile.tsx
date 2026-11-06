import {
  Button,
  Switch,
  TextField,
  TextFieldContent,
  Typography,
} from '@montage-ui/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { fieldErrors, isApiError } from '../../shared/api/errors'
import { useSession } from '../../shared/auth/session'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import {
  updateProfile,
  uploadProfileImage,
  type ImageUpload,
  type ProfilePatch,
} from '../auth/api'
import { AUTH_COPY as A } from '../auth/copy'
import {
  isNameValid,
  useHandleAvailability,
} from '../auth/useHandleAvailability'
import { MY_COPY as T } from './copy'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const IMAGE_EXTENSION = /\.(jpe?g|png|webp)$/i
const ACCEPT = '.jpg,.jpeg,.png,.webp'

const showTooLarge = () =>
  feedback.dialog({
    title: T.fileTooLargeTitle,
    description: T.fileTooLarge,
    confirmLabel: COPY.close,
  })
const showUnsupported = () =>
  feedback.dialog({
    title: T.unsupportedTitle,
    description: T.unsupported,
    confirmLabel: COPY.close,
  })

const hasReason = (e: unknown, ...reasons: string[]) =>
  isApiError(e) && e.details.some((d) => reasons.includes(d.reason ?? ''))

/** MY-002: photo, name, handle and photo visibility. Same rules as AUTH-002 (shared handle check). */
export function MyProfile() {
  const { me } = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(me?.name ?? '')
  const [handle, setHandle] = useState(me?.handle ?? '')
  // undefined: photo unchanged, null: back to the default image, object: a newly uploaded photo.
  const [upload, setUpload] = useState<ImageUpload | null>()
  const [isPublic, setIsPublic] = useState(me?.profileImagePublic ?? true)

  const trimmed = name.trim()
  const nameValid = isNameValid(trimmed)
  const handleSame = handle === me?.handle
  const { handleValid, checking, available, taken } = useHandleAvailability(
    handle,
    handleSame,
  )
  const handleOk = handleSame || available

  const photo =
    upload === undefined ? (me?.profileImageUrl ?? null) : upload?.previewUrl

  const patch: ProfilePatch = {}
  if (trimmed !== me?.name) patch.name = trimmed
  if (!handleSame) patch.handle = handle
  if (upload !== undefined) patch.profileImageUrl = upload?.imageKey ?? null
  if (isPublic !== (me?.profileImagePublic ?? true))
    patch.profileImagePublic = isPublic
  const dirty = Object.keys(patch).length > 0

  const uploading = useMutation({
    mutationFn: uploadProfileImage,
    onSuccess: setUpload,
    onError: (e) => {
      // The global handler stays silent on VALIDATION_ERROR; the file rules show a modal (1-1, 1-2).
      if (hasReason(e, 'FILE_TOO_LARGE')) void showTooLarge()
      else if (
        hasReason(
          e,
          'UNSUPPORTED_FORMAT',
          'INVALID_IMAGE',
          'UNSUPPORTED_MEDIA_TYPE',
        )
      )
        void showUnsupported()
    },
  })

  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: async (saved) => {
      queryClient.setQueryData(['me'], saved)
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      feedback.toast(COPY.saved)
      void navigate('/me')
    },
    onError: (e) => {
      // A temporary key that expired or is not ours: drop it so the user uploads again.
      if (hasReason(e, 'IMAGE_KEY_NOT_FOUND')) {
        setUpload(undefined)
        feedback.toast(T.imageExpired, 'negative')
      }
    },
  })

  const submitted = fieldErrors(save.error)
  const takenOnSave =
    hasReason(save.error, 'HANDLE_TAKEN') && save.variables?.handle === handle
  const serverErrors = {
    name: save.variables?.name === trimmed ? submitted.name : undefined,
    handle: save.variables?.handle === handle ? submitted.handle : undefined,
  }
  const handleError =
    handle && !handleValid
      ? A.handleError
      : taken || takenOnSave
        ? A.handleTaken
        : serverErrors.handle

  const pick = (file: File) => {
    if (!IMAGE_EXTENSION.test(file.name)) return void showUnsupported()
    if (file.size > MAX_IMAGE_BYTES) return void showTooLarge()
    uploading.mutate(file)
  }
  // Like Onboarding: only reset on error, so a pending save cannot be re-enabled mid-flight.
  const clearSaveError = () => {
    if (save.isError) save.reset()
  }
  const canSave = dirty && nameValid && handleOk && !uploading.isPending

  return (
    <form
      className="onboarding"
      data-screen-id="MY-002"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave && !save.isPending) save.mutate(patch)
      }}
    >
      <div className="profile-photo" role="img" aria-label={T.profilePhoto}>
        {photo ? <img src={photo} alt="" /> : <span>{trimmed.charAt(0)}</span>}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        hidden
        data-testid="photo-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = '' // lets the same file be picked again after an error
          if (file) pick(file)
        }}
      />
      <div className="start-card-actions">
        <Button
          type="button"
          size="small"
          variant="outlined"
          color="assistive"
          loading={uploading.isPending}
          onClick={() => fileInput.current?.click()}
        >
          {photo ? T.changePhoto : T.addPhoto}
        </Button>
        {photo ? (
          <Button
            type="button"
            size="small"
            variant="outlined"
            color="assistive"
            onClick={() => setUpload(null)}
          >
            {T.defaultPhoto}
          </Button>
        ) : null}
      </div>
      <div className="start-card-actions">
        <Typography variant="body2">{T.showPhoto}</Typography>
        <Switch
          aria-label={T.showPhoto}
          checked={isPublic}
          onCheckedChange={(v) => {
            setIsPublic(v)
            clearSaveError()
          }}
        />
      </div>

      <FormField
        label={A.name}
        error={name && !nameValid ? A.nameError : serverErrors.name}
      >
        <TextField
          value={name}
          placeholder={A.namePlaceholder}
          status={!nameValid ? 'negative' : 'normal'}
          onChange={(e) => {
            setName(e.target.value)
            clearSaveError()
          }}
        />
      </FormField>

      <FormField
        label={A.handle}
        error={handleError}
        success={available ? A.handleAvailable : undefined}
        hint={checking ? A.handleChecking : A.handleHint}
      >
        <TextField
          value={handle}
          placeholder={A.handlePlaceholder}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          status={handleError ? 'negative' : 'normal'}
          leadingContent={<TextFieldContent variant="text">@</TextFieldContent>}
          onChange={(e) => {
            setHandle(e.target.value)
            clearSaveError()
          }}
        />
      </FormField>
      {handleSame ? null : (
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.secondary"
        >
          {T.handleChangeNotice}
        </Typography>
      )}

      <Button
        type="submit"
        size="large"
        fullWidth
        loading={save.isPending}
        disabled={!canSave}
      >
        {T.save}
      </Button>
    </form>
  )
}

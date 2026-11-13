import { TextArea, TextField, Typography } from '@montage-ui/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { fieldErrors } from '../../shared/api/errors'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import { ReasonModal } from '../../shared/ui/ReasonModal'
import type { ClubDetail } from './api'
import { ClubPhotoField, ThemeColorField } from './ClubPhotoColorFields'
import { HEX_COLOR, type ClubImageUpload } from './createApi'
import { ClubNameTakenError, invalidateClub, updateClub } from './manageApi'
import { MANAGE_COPY as M } from './manageCopy'
import { ActionModal, RadioList } from './ManageBits'

const NAME_MAX = 100
const DESCRIPTION_MAX = 500

/**
 * CLUB-101 1-1: name, description, photo, theme colour and type. Changing the type asks for a
 * reason (API-016) after the form. The photo goes through API-129 (purpose=CLUB_PROFILE) and only
 * its key is sent; fields left alone are not sent.
 */
export function ClubEditModal({
  club,
  onClose,
}: {
  club: ClubDetail
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(club.name)
  const [description, setDescription] = useState(club.description ?? '')
  const [clubType, setClubType] = useState(club.clubType)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string>()
  // keep: as it is; reset: back to the default image; otherwise the newly uploaded photo.
  const [photo, setPhoto] = useState<'keep' | 'reset' | ClubImageUpload>('keep')
  const [uploading, setUploading] = useState(false)
  const onBusyChange = useCallback((busy: boolean) => setUploading(busy), [])
  const [color, setColor] = useState(club.themeColor ?? '')

  const trimmed = name.trim()
  const typeChanged = clubType !== club.clubType
  const colorValid = color === '' || HEX_COLOR.test(color)
  const colorChanged = color.toUpperCase() !== (club.themeColor ?? '')
  const previewUrl =
    photo === 'keep'
      ? club.profileImageUrl
      : photo === 'reset'
        ? null
        : photo.previewUrl
  const save = useMutation({
    mutationFn: (reason?: string) =>
      updateClub(club.id, {
        name: trimmed,
        description: description.trim() || null,
        ...(photo === 'keep'
          ? {}
          : { profileImageKey: photo === 'reset' ? null : photo.imageKey }),
        ...(colorChanged
          ? { themeColor: color ? color.toUpperCase() : null }
          : {}),
        ...(typeChanged
          ? { clubType, clubTypeChangeReason: reason ?? '' }
          : {}),
      }),
    onSuccess: async () => {
      await invalidateClub(queryClient, club.id)
      feedback.toast(COPY.saved, 'positive')
      onClose()
    },
    onError: (e) => {
      setAsking(false)
      if (e instanceof ClubNameTakenError) setError(M.nameTaken)
      else if (fieldErrors(e).name !== undefined) setError(COPY.checkInput)
    },
  })

  return (
    <>
      <ActionModal
        open={!asking}
        title={M.editClubTitle}
        actionLabel={M.save}
        actionDisabled={trimmed.length === 0 || !colorValid || uploading}
        loading={save.isPending}
        onClose={onClose}
        onSubmit={() =>
          typeChanged ? setAsking(true) : save.mutate(undefined)
        }
      >
        <FormField label={M.labelName} error={error}>
          <TextField
            value={name}
            maxLength={NAME_MAX}
            status={error ? 'negative' : 'normal'}
            onChange={(e) => {
              setName(e.target.value)
              setError(undefined)
            }}
          />
        </FormField>
        <FormField label={M.labelDescription}>
          <TextArea
            aria-label={M.labelDescription}
            value={description}
            maxLength={DESCRIPTION_MAX}
            minRows={3}
            onChange={(e) =>
              setDescription(e.target.value.slice(0, DESCRIPTION_MAX))
            }
          />
        </FormField>
        <ClubPhotoField
          previewUrl={previewUrl}
          initial={trimmed.charAt(0)}
          canReset={
            typeof photo === 'object' ||
            (photo === 'keep' && !!club.profileImageUrl)
          }
          onUploaded={setPhoto}
          onReset={() => setPhoto(club.profileImageUrl ? 'reset' : 'keep')}
          onBusyChange={onBusyChange}
        />
        <ThemeColorField value={color} onChange={setColor} />
        <Typography variant="body2" weight="bold">
          {M.labelClubType}
        </Typography>
        <RadioList
          name={M.labelClubType}
          value={clubType}
          options={[
            { value: 'CLUB', label: M.typeClub },
            { value: 'BAND', label: M.typeBand },
          ]}
          onChange={setClubType}
        />
        {typeChanged ? (
          <Typography
            variant="caption1"
            color="semantic.foreground.neutral.secondary"
          >
            {clubType === 'BAND' ? M.typeToBand : M.typeToClub}
          </Typography>
        ) : null}
      </ActionModal>
      <ReasonModal
        open={asking}
        title={M.clubTypeReasonTitle}
        description={clubType === 'BAND' ? M.typeToBand : M.typeToClub}
        actionLabel={M.save}
        loading={save.isPending}
        onClose={() => setAsking(false)}
        onSubmit={(reason) => save.mutate(reason)}
      />
    </>
  )
}

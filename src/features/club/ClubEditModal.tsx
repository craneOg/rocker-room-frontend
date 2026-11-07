import { TextArea, TextField, Typography } from '@montage-ui/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fieldErrors } from '../../shared/api/errors'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import { ReasonModal } from '../../shared/ui/ReasonModal'
import type { ClubDetail } from './api'
import { ClubNameTakenError, invalidateClub, updateClub } from './manageApi'
import { MANAGE_COPY as M } from './manageCopy'
import { ActionModal, RadioList } from './ManageBits'

const NAME_MAX = 100
const DESCRIPTION_MAX = 500

/**
 * CLUB-101 1-1: name, description and type. Changing the type asks for a reason (API-016) after
 * the form. The profile image and theme colour are not editable yet (needs the upload API-130).
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

  const trimmed = name.trim()
  const typeChanged = clubType !== club.clubType
  const save = useMutation({
    mutationFn: (reason?: string) =>
      updateClub(club.id, {
        name: trimmed,
        description: description.trim() || null,
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
        actionDisabled={trimmed.length === 0}
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

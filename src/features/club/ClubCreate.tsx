import {
  Button,
  ContentBadge,
  Switch,
  TextArea,
  TextField,
  Typography,
} from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useDebounced } from '../auth/useHandleAvailability'
import { isApiError } from '../../shared/api/errors'
import { COPY } from '../../shared/ui/copy'
import { feedback } from '../../shared/ui/feedbackBus'
import { FormField } from '../../shared/ui/FormField'
import {
  checkClubName,
  HEX_COLOR,
  IMAGE_ACCEPT,
  IMAGE_EXTENSION,
  MAX_IMAGE_BYTES,
  createClub,
  uploadClubImage,
  type ClubImageUpload,
  type CreatedClub,
} from './createApi'
import { CREATE_COPY as T } from './createCopy'
import { ClubNameTakenError } from './manageApi'
import { RadioList } from './ManageBits'

const NAME_MAX = 100
const DESCRIPTION_MAX = 500
const NAME_CHECK_MS = 500

/** CLUB-001: create a club (the creator becomes its first officer), then 6-1. */
export function ClubCreate() {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadGeneration = useRef(0)
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [description, setDescription] = useState('')
  // null: no photo (default image).
  const [upload, setUpload] = useState<ClubImageUpload | null>(null)
  const [photoError, setPhotoError] = useState<string>()
  const [color, setColor] = useState('')
  const [clubType, setClubType] = useState<'CLUB' | 'BAND'>('CLUB')
  const [issueJoinCode, setIssueJoinCode] = useState(true)
  const [isSearchable, setIsSearchable] = useState(false)
  const [created, setCreated] = useState<CreatedClub>()

  const trimmed = name.trim()
  const nameValid = trimmed.length >= 1 && trimmed.length <= NAME_MAX
  const colorValid = color === '' || HEX_COLOR.test(color)

  const debounced = useDebounced(trimmed, NAME_CHECK_MS)
  const availability = useQuery({
    queryKey: ['club-name-availability', debounced],
    queryFn: ({ signal }) => checkClubName(debounced, signal),
    enabled: nameValid && debounced === trimmed,
    staleTime: 0,
  })
  const settled = nameValid && debounced === trimmed && availability.isSuccess

  const uploading = useMutation({
    mutationFn: uploadClubImage,
    onError: (e) => {
      // The global handler stays silent on VALIDATION_ERROR; the file rules show as helper text.
      const reasons = isApiError(e) ? e.details.map((d) => d.reason) : []
      if (reasons.includes('FILE_TOO_LARGE')) setPhotoError(T.fileTooLarge)
      else if (reasons.length > 0) setPhotoError(T.fileUnsupported)
    },
  })

  const create = useMutation({
    mutationFn: createClub,
    onSuccess: async (club) => {
      // The creator is a member now: refresh the session before offering the club's screens.
      await queryClient.invalidateQueries({ queryKey: ['me', 'memberships'] })
      setCreated(club)
    },
    onError: (e) => {
      // The image key expired or is not ours: drop it so the user uploads again.
      if (
        isApiError(e) &&
        e.details.some((d) => d.reason === 'IMAGE_KEY_NOT_FOUND')
      ) {
        setUpload(null)
        feedback.toast(T.imageExpired, 'negative')
      }
    },
  })

  const takenOnSave =
    create.error instanceof ClubNameTakenError &&
    create.variables?.name === trimmed
  const taken =
    takenOnSave || (settled && availability.data.available === false)
  const available = !taken && settled && availability.data.available

  const nameError =
    nameTouched && !nameValid ? T.nameEmpty : taken ? T.nameTaken : undefined

  const pick = (file: File) => {
    if (!IMAGE_EXTENSION.test(file.name))
      return setPhotoError(T.fileUnsupported)
    if (file.size > MAX_IMAGE_BYTES) return setPhotoError(T.fileTooLarge)
    setPhotoError(undefined)
    // A later pick or "default photo" supersedes this upload: its result is then ignored.
    const generation = ++uploadGeneration.current
    uploading.mutate(file, {
      onSuccess: (u) => {
        if (generation === uploadGeneration.current) setUpload(u)
      },
    })
  }

  const canSubmit =
    nameValid &&
    !taken &&
    colorValid &&
    !uploading.isPending &&
    !create.isPending

  const submit = () => {
    if (!canSubmit) return
    const desc = description.trim()
    create.mutate({
      name: trimmed,
      ...(desc ? { description: desc } : {}),
      clubType,
      isSearchable,
      issueJoinCode,
      ...(upload ? { profileImageKey: upload.imageKey } : {}),
      ...(color ? { themeColor: color.toUpperCase() } : {}),
    })
  }

  if (created) return <CreateDone club={created} />

  return (
    <form
      className="onboarding"
      data-screen-id="CLUB-001"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Typography variant="title2" weight="bold" as="h1">
        {T.title}
      </Typography>

      <FormField
        label={T.name}
        error={nameError}
        success={available ? T.nameAvailable : undefined}
      >
        <TextField
          value={name}
          placeholder={T.namePlaceholder}
          maxLength={NAME_MAX}
          status={nameError ? 'negative' : 'normal'}
          onChange={(e) => {
            setName(e.target.value)
            setNameTouched(true)
            // Only reset on error: resetting while pending would allow a duplicate submit.
            if (create.isError) create.reset()
          }}
        />
      </FormField>

      <FormField
        label={T.description}
        hint={`${description.length}/${DESCRIPTION_MAX}`}
      >
        <TextArea
          aria-label={T.description}
          value={description}
          placeholder={T.descriptionPlaceholder}
          maxLength={DESCRIPTION_MAX}
          minRows={3}
          onChange={(e) =>
            setDescription(e.target.value.slice(0, DESCRIPTION_MAX))
          }
        />
      </FormField>

      <section className="start-section">
        <Typography variant="body2" weight="bold">
          {T.profilePhoto}
        </Typography>
        <div className="profile-photo" role="img" aria-label={T.profilePhoto}>
          {upload ? (
            <img src={upload.previewUrl} alt="" />
          ) : (
            <span>{trimmed.charAt(0)}</span>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_ACCEPT}
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
            {upload ? T.changePhoto : T.addPhoto}
          </Button>
          {upload ? (
            <Button
              type="button"
              size="small"
              variant="outlined"
              color="assistive"
              onClick={() => {
                uploadGeneration.current++
                setUpload(null)
              }}
            >
              {T.defaultPhoto}
            </Button>
          ) : null}
        </div>
        <div className="helper-slot">
          {photoError ? (
            <Typography
              variant="caption1"
              color="semantic.foreground.negative.primary"
            >{`* ${photoError}`}</Typography>
          ) : null}
        </div>
      </section>

      <FormField
        label={T.themeColor}
        error={colorValid ? undefined : T.themeColorInvalid}
      >
        <div className="club-code-row">
          <TextField
            value={color}
            placeholder={T.themeColorPlaceholder}
            maxLength={7}
            autoComplete="off"
            spellCheck={false}
            status={colorValid ? 'normal' : 'negative'}
            onChange={(e) => setColor(e.target.value.trim())}
          />
          <input
            type="color"
            aria-label={T.themeColor}
            value={HEX_COLOR.test(color) ? color.toLowerCase() : '#000000'}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
          />
        </div>
      </FormField>

      <section className="start-section">
        <Typography variant="body2" weight="bold">
          {T.type}
        </Typography>
        <RadioList
          name={T.type}
          value={clubType}
          options={[
            { value: 'CLUB', label: T.typeClub, hint: T.typeClubHint },
            { value: 'BAND', label: T.typeBand, hint: T.typeBandHint },
          ]}
          onChange={(v) => setClubType(v === 'BAND' ? 'BAND' : 'CLUB')}
        />
      </section>

      <section className="start-section">
        <Typography variant="body2" weight="bold">
          {T.joinSettings}
        </Typography>
        <div className="start-card-actions">
          <div>
            <Typography variant="body2">{T.useJoinCode}</Typography>
            <Typography
              variant="caption1"
              color="semantic.foreground.neutral.secondary"
            >
              {T.useJoinCodeHint}
            </Typography>
          </div>
          <Switch
            aria-label={T.useJoinCode}
            checked={issueJoinCode}
            onCheckedChange={setIssueJoinCode}
          />
        </div>
        <div className="start-card-actions">
          <div>
            <Typography variant="body2">{T.searchable}</Typography>
            <Typography
              variant="caption1"
              color="semantic.foreground.neutral.secondary"
            >
              {T.searchableHint}
            </Typography>
          </div>
          <Switch
            aria-label={T.searchable}
            checked={isSearchable}
            onCheckedChange={setIsSearchable}
          />
        </div>
        {!issueJoinCode && !isSearchable ? (
          <Typography
            variant="caption1"
            color="semantic.foreground.neutral.secondary"
          >
            {T.directOnly}
          </Typography>
        ) : null}
      </section>

      <section className="start-section">
        <Typography variant="body2" weight="bold">
          {T.defaultParts}
        </Typography>
        <div className="start-card-actions">
          {T.defaultPartsNames.map((p) => (
            <ContentBadge key={p} size="small" color="neutral" variant="solid">
              {p}
            </ContentBadge>
          ))}
        </div>
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.secondary"
        >
          {T.defaultPartsHint}
        </Typography>
      </section>

      <Button
        type="submit"
        size="large"
        fullWidth
        loading={create.isPending}
        disabled={!canSubmit}
      >
        {T.submit}
      </Button>
    </form>
  )
}

/** 6-1: full-page completion with the invite tools. */
function CreateDone({ club }: { club: CreatedClub }) {
  const navigate = useNavigate()
  const code = club.joinCode ?? null
  const link = code ? `${location.origin}/join/${code}` : ''
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      feedback.toast(T.copied)
    } catch {
      feedback.toast(COPY.unknownError, 'negative')
    }
  }

  return (
    <div className="start" data-screen-id="CLUB-001-done">
      <Typography variant="title2" weight="bold" as="h1">
        {T.doneTitle(club.name)}
      </Typography>
      {code ? (
        <section className="start-section">
          <Button size="large" onClick={() => void copy(link)}>
            {T.copyLink}
          </Button>
          <Typography variant="title1" weight="bold" className="join-code">
            {code}
          </Typography>
          <div className="start-card-actions">
            <Button
              size="small"
              variant="outlined"
              color="assistive"
              onClick={() => void copy(code)}
            >
              {T.copyCode}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="assistive"
              onClick={() => void copy(T.inviteText(club.name, code, link))}
            >
              {T.copyInvite}
            </Button>
          </div>
        </section>
      ) : null}
      <Typography variant="body2" color="semantic.foreground.neutral.secondary">
        {code || club.isSearchable ? T.doneHint : T.doneHintDirect}
      </Typography>
      <Button size="large" onClick={() => void navigate(`/clubs/${club.id}`)}>
        {T.goClub}
      </Button>
      <Button
        size="large"
        variant="outlined"
        color="assistive"
        onClick={() => void navigate(`/clubs/${club.id}/performances/new`)}
      >
        {T.firstPerformance}
      </Button>
    </div>
  )
}

import { Button, TextField, Typography } from '@montage-ui/core'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { isApiError } from '../../shared/api/errors'
import { FormField } from '../../shared/ui/FormField'
import {
  HEX_COLOR,
  IMAGE_ACCEPT,
  IMAGE_EXTENSION,
  MAX_IMAGE_BYTES,
  uploadClubImage,
  type ClubImageUpload,
} from './createApi'
import { CREATE_COPY as T } from './createCopy'

/** CLUB-101 1-1 photo: shows `previewUrl`, uploads through API-129 and reports the new key. */
export function ClubPhotoField({
  previewUrl,
  initial,
  canReset,
  onUploaded,
  onReset,
  onBusyChange,
}: {
  previewUrl: string | null
  initial: string
  /** Offer "default image": a photo is set, or a new one was picked. */
  canReset: boolean
  onUploaded: (upload: ClubImageUpload) => void
  onReset: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const [error, setError] = useState<string>()
  const uploading = useMutation({
    mutationFn: uploadClubImage,
    onError: (e) => {
      // The global handler stays silent on VALIDATION_ERROR; the file rules show as helper text.
      const reasons = isApiError(e) ? e.details.map((d) => d.reason) : []
      if (reasons.includes('FILE_TOO_LARGE')) setError(T.fileTooLarge)
      else if (reasons.length > 0) setError(T.fileUnsupported)
    },
  })
  useEffect(
    () => onBusyChange(uploading.isPending),
    [uploading.isPending, onBusyChange],
  )

  const pick = (file: File) => {
    if (!IMAGE_EXTENSION.test(file.name)) return setError(T.fileUnsupported)
    if (file.size > MAX_IMAGE_BYTES) return setError(T.fileTooLarge)
    setError(undefined)
    // A later pick or "default image" supersedes this upload: its result is then ignored.
    const mine = ++generation.current
    uploading.mutate(file, {
      onSuccess: (u) => {
        if (mine === generation.current) onUploaded(u)
      },
    })
  }

  return (
    <section className="start-section">
      <Typography variant="body2" weight="bold">
        {T.profilePhoto}
      </Typography>
      <div className="profile-photo" role="img" aria-label={T.profilePhoto}>
        {previewUrl ? <img src={previewUrl} alt="" /> : <span>{initial}</span>}
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
          {previewUrl ? T.changePhoto : T.addPhoto}
        </Button>
        {canReset ? (
          <Button
            type="button"
            size="small"
            variant="outlined"
            color="assistive"
            onClick={() => {
              generation.current++
              setError(undefined)
              onReset()
            }}
          >
            {T.defaultPhoto}
          </Button>
        ) : null}
      </div>
      <div className="helper-slot">
        {error ? (
          <Typography
            variant="caption1"
            color="semantic.foreground.negative.primary"
          >{`* ${error}`}</Typography>
        ) : null}
      </div>
    </section>
  )
}

/** CLUB-101 1-1 theme colour: #RRGGBB text plus the native picker; empty clears it. */
export function ThemeColorField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const valid = value === '' || HEX_COLOR.test(value)
  return (
    <FormField
      label={T.themeColor}
      error={valid ? undefined : T.themeColorInvalid}
    >
      <div className="club-code-row">
        <TextField
          value={value}
          placeholder={T.themeColorPlaceholder}
          maxLength={7}
          autoComplete="off"
          spellCheck={false}
          status={valid ? 'normal' : 'negative'}
          onChange={(e) => onChange(e.target.value.trim())}
        />
        <input
          type="color"
          aria-label={T.themeColor}
          value={HEX_COLOR.test(value) ? value.toLowerCase() : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      </div>
    </FormField>
  )
}

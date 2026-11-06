import { Button, TextField, Typography } from '@montage-ui/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { FormField } from '../../shared/ui/FormField'
import { feedback } from '../../shared/ui/feedbackBus'
import { EmptyState, ListSkeleton } from '../../shared/ui/StateViews'
import {
  addPart,
  getParts,
  PART_NAME_MAX,
  PartNameTakenError,
  updatePart,
  type Part,
} from './settingsApi'
import { SETTINGS_COPY as T } from './settingsCopy'
import { LoadError } from './SettingsViews'

/** Moves `from` to `to`, giving the list strictly increasing orders that reuse the old values. */
export function reorder(parts: Part[], from: number, to: number): Part[] {
  const moved = [...parts]
  moved.splice(to, 0, ...moved.splice(from, 1))
  const orders = parts.map((p) => p.displayOrder).sort((a, b) => a - b)
  let previous = -1
  return moved.map((p, i) => {
    previous = Math.max(orders[i] ?? 0, previous + 1)
    return { ...p, displayOrder: previous }
  })
}

/** CLUB-107: add, rename, reorder and deactivate the club's parts (officers only). */
export function PartSettings() {
  const { clubId = '' } = useParams()
  const queryClient = useQueryClient()
  const key = ['club', clubId, 'parts']
  const parts = useQuery({ queryKey: key, queryFn: () => getParts(clubId) })
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(
    null,
  )
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string>()
  const [dragIndex, setDragIndex] = useState<number>()

  const replace = (next: Part) =>
    queryClient.setQueryData<Part[]>(key, (list) =>
      list?.map((p) => (p.id === next.id ? { ...p, ...next } : p)),
    )

  const create = useMutation({
    mutationFn: (v: { name: string; order: number }) =>
      addPart(clubId, v.name, v.order),
    onSuccess: (part) => {
      queryClient.setQueryData<Part[]>(key, (list) => [
        ...(list ?? []),
        { ...part, memberCount: 0 },
      ])
      setAdding(null)
    },
    onError: (e) => {
      if (e instanceof PartNameTakenError) setError(T.partNameTaken)
    },
  })
  const rename = useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      updatePart(clubId, v.id, { name: v.name }),
    onSuccess: (part) => {
      replace(part)
      setEditing(null)
    },
    onError: (e) => {
      if (e instanceof PartNameTakenError) setError(T.partNameTaken)
    },
  })
  const setActive = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) =>
      updatePart(clubId, v.id, { isActive: v.isActive }),
    onSuccess: replace,
  })
  // API-035: no bulk reorder, so one PATCH per part whose order changed (each is independent).
  const saveOrder = useMutation({
    mutationFn: async (v: { next: Part[]; changed: Part[] }) => {
      const results = await Promise.allSettled(
        v.changed.map((p) =>
          updatePart(clubId, p.id, { displayOrder: p.displayOrder }),
        ),
      )
      const failed = results.find((r) => r.status === 'rejected')
      if (failed) throw failed.reason
    },
    onMutate: ({ next }) =>
      queryClient.setQueryData<Part[]>(key, (list) =>
        list?.map((p) => next.find((n) => n.id === p.id) ?? p),
      ),
    // Part of the changes may have been saved: show what the server has.
    onError: () => void queryClient.invalidateQueries({ queryKey: key }),
  })

  if (parts.isError) return <LoadError onRetry={() => void parts.refetch()} />
  if (!parts.data)
    return (
      <div className="start" data-screen-id="CLUB-107">
        <ListSkeleton rows={4} />
      </div>
    )

  // Same order as the server's (displayOrder, id); an optimistic reorder only changes displayOrder.
  const sorted = [...parts.data].sort(
    (a, b) => a.displayOrder - b.displayOrder || Number(a.id) - Number(b.id),
  )
  const active = sorted.filter((p) => p.isActive)
  const inactive = sorted.filter((p) => !p.isActive)
  const nextOrder = Math.max(-1, ...parts.data.map((p) => p.displayOrder)) + 1

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= active.length) return
    const next = reorder(active, from, to)
    const changed = next.filter(
      (p) => active.find((a) => a.id === p.id)?.displayOrder !== p.displayOrder,
    )
    saveOrder.mutate({ next, changed })
  }

  const submit = (
    value: string,
    save: (name: string) => void,
    e: React.SyntheticEvent,
  ) => {
    e.preventDefault()
    const name = value.trim()
    if (name === '') return setError(T.partNameInvalid)
    setError(undefined)
    save(name)
  }

  const deactivate = async (part: Part) => {
    const choice = await feedback.dialog({
      title: T.deactivateTitle(part.name),
      description: T.deactivateDescription,
      cancelLabel: T.cancel,
      confirmLabel: T.deactivate,
      danger: true,
    })
    if (choice === 'confirm') setActive.mutate({ id: part.id, isActive: false })
  }

  const nameField = (value: string, onChange: (v: string) => void) => (
    <FormField label={T.partName} error={error}>
      <TextField
        value={value}
        maxLength={PART_NAME_MAX}
        autoComplete="off"
        status={error ? 'negative' : 'normal'}
        onChange={(e) => {
          setError(undefined)
          onChange(e.target.value)
        }}
      />
    </FormField>
  )

  return (
    <div className="start" data-screen-id="CLUB-107">
      <Typography variant="title2" weight="bold" as="h1">
        {T.partsTitle}
      </Typography>

      <section className="start-section">
        <Typography variant="body1" weight="bold" as="h2">
          {T.partsActive}
        </Typography>
        {active.length === 0 ? <EmptyState description={T.partsEmpty} /> : null}
        {active.map((part, i) => (
          <article
            key={part.id}
            aria-label={part.name}
            className="start-card"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== undefined) move(dragIndex, i)
              setDragIndex(undefined)
            }}
          >
            {editing?.id === part.id ? (
              <form
                className="club-code-row"
                onSubmit={(e) =>
                  submit(
                    editing.name,
                    (name) => rename.mutate({ id: part.id, name }),
                    e,
                  )
                }
              >
                {nameField(editing.name, (name) =>
                  setEditing({ id: part.id, name }),
                )}
                <Button type="submit" size="large" loading={rename.isPending}>
                  {T.save}
                </Button>
                <Button
                  type="button"
                  size="large"
                  variant="outlined"
                  color="assistive"
                  onClick={() => {
                    setEditing(null)
                    setError(undefined)
                  }}
                >
                  {T.cancel}
                </Button>
              </form>
            ) : (
              <>
                <div className="start-card-actions">
                  <span
                    role="img"
                    aria-label={T.dragHandle(part.name)}
                    className="part-handle"
                    draggable
                    onDragStart={() => setDragIndex(i)}
                  >
                    ≡
                  </span>
                  <div className="start-card-text">
                    <Typography variant="body1" weight="bold">
                      {part.name}
                    </Typography>
                    <Typography
                      variant="caption1"
                      color="semantic.foreground.neutral.secondary"
                    >
                      {T.members(part.memberCount ?? 0)}
                    </Typography>
                  </div>
                </div>
                <div className="start-card-actions">
                  <Button
                    size="small"
                    variant="outlined"
                    color="assistive"
                    disabled={i === 0 || saveOrder.isPending}
                    onClick={() => move(i, i - 1)}
                  >
                    {T.moveUp}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="assistive"
                    disabled={i === active.length - 1 || saveOrder.isPending}
                    onClick={() => move(i, i + 1)}
                  >
                    {T.moveDown}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="assistive"
                    onClick={() => {
                      setError(undefined)
                      setAdding(null)
                      setEditing({ id: part.id, name: part.name })
                    }}
                  >
                    {T.rename}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="assistive"
                    disabled={setActive.isPending}
                    onClick={() => void deactivate(part)}
                  >
                    {T.deactivate}
                  </Button>
                </div>
              </>
            )}
          </article>
        ))}
      </section>

      <section className="start-section">
        {adding === null ? (
          <Button
            variant="outlined"
            color="assistive"
            onClick={() => {
              setError(undefined)
              setEditing(null)
              setAdding('')
            }}
          >
            {T.addPart}
          </Button>
        ) : (
          <form
            className="club-code-row"
            onSubmit={(e) =>
              submit(
                adding,
                (name) => create.mutate({ name, order: nextOrder }),
                e,
              )
            }
          >
            {nameField(adding, setAdding)}
            <Button type="submit" size="large" loading={create.isPending}>
              {T.save}
            </Button>
            <Button
              type="button"
              size="large"
              variant="outlined"
              color="assistive"
              onClick={() => {
                setAdding(null)
                setError(undefined)
              }}
            >
              {T.cancel}
            </Button>
          </form>
        )}
      </section>

      {inactive.length > 0 ? (
        <details className="start-section">
          <summary>{T.partsInactive(inactive.length)}</summary>
          {inactive.map((part) => (
            <article
              key={part.id}
              aria-label={part.name}
              className="start-card"
            >
              <div className="start-card-text">
                <Typography variant="body1" weight="bold">
                  {part.name}
                </Typography>
                <Typography
                  variant="caption1"
                  color="semantic.foreground.neutral.secondary"
                >
                  {T.members(part.memberCount ?? 0)}
                </Typography>
              </div>
              <Button
                size="small"
                variant="outlined"
                color="assistive"
                disabled={setActive.isPending}
                onClick={() =>
                  setActive.mutate({ id: part.id, isActive: true })
                }
              >
                {T.reactivate}
              </Button>
            </article>
          ))}
        </details>
      ) : null}
    </div>
  )
}

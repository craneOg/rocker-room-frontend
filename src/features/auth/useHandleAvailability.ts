import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { checkHandle } from './api'

// Screen spec and ERD v7: 5~30 (the older API table says 3, ignored).
export const HANDLE_PATTERN = /^[a-z0-9_]{5,30}$/
const HANDLE_DEBOUNCE_MS = 400

export const isNameValid = (trimmed: string) =>
  trimmed.length >= 1 && trimmed.length <= 50

function useDebounced<V>(value: V, ms: number): V {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** Shared by AUTH-002 and MY-002. `skip` turns the check off (e.g. the handle is the user's own). */
export function useHandleAvailability(handle: string, skip = false) {
  const handleValid = HANDLE_PATTERN.test(handle)
  // Keyed by the handle itself, so a late response for an old input can never show for a new one.
  const debounced = useDebounced(handle, HANDLE_DEBOUNCE_MS)
  const availability = useQuery({
    queryKey: ['handle-availability', debounced],
    queryFn: ({ signal }) => checkHandle(debounced, signal),
    enabled: handleValid && !skip && debounced === handle,
    staleTime: 0,
  })
  const checking =
    handleValid &&
    !skip &&
    !availability.isError &&
    (debounced !== handle || availability.isFetching)
  const settled = handleValid && !skip && !checking
  return {
    handleValid,
    checking,
    available: settled && availability.data?.available === true,
    taken: settled && availability.data?.available === false,
  }
}

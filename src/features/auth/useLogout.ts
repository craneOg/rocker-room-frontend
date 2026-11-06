import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { setSignedIn } from '../../shared/api/client'
import { logout } from './api'

/** Logs out this device (API-005), drops the cached session and goes to the login screen. */
export function useLogout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      setSignedIn(false)
      await queryClient.resetQueries()
      navigate('/', { replace: true })
    },
  })
}

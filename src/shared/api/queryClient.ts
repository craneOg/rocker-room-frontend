import { QueryClient } from '@tanstack/react-query'
import { isApiError } from './errors'
import { createCaches } from './handlers'

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    ...createCaches(() => client),
    defaultOptions: {
      queries: {
        retry: (count, error) => !isApiError(error) && count < 2,
        refetchOnWindowFocus: false,
      },
    },
  })
  return client
}

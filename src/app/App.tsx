import { ThemeProvider } from '@montage-ui/core'
import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { configureClient } from '../shared/api/client'
import { createQueryClient } from '../shared/api/queryClient'
import { SessionProvider } from '../shared/auth/session'
import { COPY } from '../shared/ui/copy'
import { feedback, registerFeedback } from '../shared/ui/feedbackBus'
import { FeedbackHost } from '../shared/ui/FeedbackHost'
import { routes } from './routes'

const queryClient = createQueryClient()
const router = createBrowserRouter(routes)

registerFeedback({ navigate: (path) => void router.navigate(path) })
configureClient({
  onSessionExpired: () => {
    feedback.toast(COPY.loginAgain, 'negative')
    queryClient.clear()
    feedback.navigate('/')
  },
})

export default function App() {
  return (
    <ThemeProvider enableDarkMode>
      <QueryClientProvider client={queryClient}>
        <FeedbackHost />
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

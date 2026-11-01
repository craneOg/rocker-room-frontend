import {
  Button,
  Modal,
  ModalContainer,
  ModalContent,
  ModalDescription,
  ModalHeading,
  TextButton,
  Typography,
} from '@montage-ui/core'
import { useState } from 'react'
import { COPY } from '../../shared/ui/copy'
import { startKakaoLogin } from './api'
import { AUTH_COPY as T } from './copy'

function StartButton() {
  return (
    <div className="landing-btn">
      <Button size="large" fullWidth onClick={startKakaoLogin}>
        {T.start}
      </Button>
    </div>
  )
}

/** AUTH-001: the only anonymous screen; every start button goes to Kakao login. */
export function LoginScreen() {
  const [sheetOpen, setSheetOpen] = useState(false)
  return (
    <div className="landing" data-screen-id="AUTH-001">
      <header className="landing-top">
        <Typography
          variant="heading2"
          weight="bold"
          color="semantic.foreground.brand.primary"
        >
          {COPY.serviceName}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          color="assistive"
          onClick={startKakaoLogin}
        >
          {T.login}
        </Button>
      </header>

      <section className="landing-hero">
        <div className="landing-image">{T.heroImage}</div>
        <div className="landing-hero-text">
          <Typography variant="display3" weight="bold" as="h1">
            {T.heroTitle[0]}
            <br />
            {T.heroTitle[1]}
          </Typography>
          <Typography
            variant="body1"
            color="semantic.foreground.neutral.secondary"
          >
            {T.heroSubtitle}
          </Typography>
          <StartButton />
          <Typography
            variant="caption1"
            color="semantic.foreground.neutral.tertiary"
          >
            {T.startNote}
          </Typography>
        </div>
      </section>

      <section className="landing-section">
        <Typography variant="title3" weight="bold" as="h2">
          {T.featuresTitle}
        </Typography>
        <ul className="landing-grid landing-features">
          {T.features.map(([title, body]) => (
            <li key={title} className="landing-card">
              <Typography variant="body1" weight="bold">
                {title}
              </Typography>
              <Typography
                variant="body2"
                color="semantic.foreground.neutral.secondary"
              >
                {body}
              </Typography>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-section">
        <Typography variant="title3" weight="bold" as="h2">
          {T.stepsTitle}
        </Typography>
        <ol className="landing-grid landing-steps">
          {T.steps.map((step, i) => (
            <li key={step} className="landing-card landing-step">
              <span className="landing-step-no">{i + 1}</span>
              <Typography variant="body2">{step}</Typography>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-card landing-cta">
        <Typography variant="title3" weight="bold" as="h2">
          {T.ctaTitle}
        </Typography>
        <StartButton />
      </section>

      <footer className="landing-footer">
        <TextButton
          color="assistive"
          size="small"
          onClick={() => setSheetOpen(true)}
        >
          {T.accountProblem}
        </TextButton>
        {/* Terms links have no target yet: plain text. */}
        <Typography
          variant="caption1"
          color="semantic.foreground.neutral.tertiary"
        >
          {T.terms}
        </Typography>
      </footer>

      <Modal open={sheetOpen} onOpenChange={setSheetOpen}>
        <ModalContainer variant="bottom">
          <ModalContent>
            <ModalHeading>{T.recoveryTitle}</ModalHeading>
            <ModalDescription>{T.recoveryBody}</ModalDescription>
            <Typography variant="body2" weight="bold">
              {T.recoveryContact}
            </Typography>
            <Button
              variant="outlined"
              color="assistive"
              fullWidth
              onClick={() => setSheetOpen(false)}
            >
              {T.close}
            </Button>
          </ModalContent>
        </ModalContainer>
      </Modal>
    </div>
  )
}

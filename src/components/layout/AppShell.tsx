import type { ReactNode } from 'react'
import { useGameStore } from '../../store/gameStore'
import type { Game, GameStatus } from '../../lib/types'
import { Button } from '../ui'
import './shell.css'

const STEPS: readonly { status: GameStatus; label: string }[] = [
  { status: 'setup', label: 'Seats' },
  { status: 'active', label: 'Table' },
  { status: 'cash-out', label: 'Cash out' },
  { status: 'settled', label: 'Settled' },
]

function StatusStepper({ status }: { status: GameStatus }) {
  const currentIndex = STEPS.findIndex((step) => step.status === status)
  return (
    <ol className="stepper" aria-label="Game progress">
      {STEPS.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'
        return (
          <li key={step.status} className={`stepper__step stepper__step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="stepper__label">{step.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="var(--gold)" />
      <circle cx="32" cy="32" r="30" fill="none" stroke="var(--felt-900)" strokeWidth="8" strokeDasharray="12 10.85" />
      <circle cx="32" cy="32" r="17" fill="var(--felt-900)" />
      <text x="32" y="39" textAnchor="middle" fontFamily="Georgia, serif" fontSize="20" fontWeight="700" fill="var(--cream)">
        ♠
      </text>
    </svg>
  )
}

export function AppShell({ game, children }: { game: Game | null; children: ReactNode }) {
  const setActiveGame = useGameStore((state) => state.setActiveGame)
  return (
    <>
      <header className="shell__header">
        <button type="button" className="brand" onClick={() => setActiveGame(null)} aria-label="Go to league home">
          <BrandMark />
          <span>
            <span className="brand__name">Alpine Poker League</span>
            <span className="brand__sub">Ledger &amp; settlements</span>
          </span>
        </button>
        <div className="shell__context">
          {game && (
            <>
              <span className="shell__game">{game.name}</span>
              <StatusStepper status={game.status} />
            </>
          )}
        </div>
        <nav aria-label="Main navigation">
          {game && (
            <Button size="sm" variant="ghost" onClick={() => setActiveGame(null)}>
              League home
            </Button>
          )}
        </nav>
      </header>
      <main className="shell__main">{children}</main>
      <footer className="shell__footer">Games are saved in this browser only. Export a game to keep it elsewhere.</footer>
    </>
  )
}

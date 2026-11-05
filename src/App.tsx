import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AppShell } from './components/layout/AppShell'
import { CashOutScreen } from './components/cashout/CashOutScreen'
import { HomeScreen } from './components/home/HomeScreen'
import { SettlementScreen } from './components/settlement/SettlementScreen'
import { SetupScreen } from './components/setup/SetupScreen'
import { TableScreen } from './components/table/TableScreen'
import { Toaster } from './components/ui/Toaster'
import { useActiveGame } from './hooks/useActiveGame'
import type { Game } from './lib/types'

function ScreenFor({ game }: { game: Game }) {
  switch (game.status) {
    case 'setup':
      return <SetupScreen game={game} />
    case 'active':
      return <TableScreen game={game} />
    case 'cash-out':
      return <CashOutScreen game={game} />
    case 'settled':
      return <SettlementScreen game={game} />
  }
}

type BoundaryState = { error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="crash">
        <h1>Something went wrong</h1>
        <p className="muted">Your games are saved locally. Reload to pick up where you left off.</p>
        <pre>{this.state.error.message}</pre>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    )
  }
}

export default function App() {
  const game = useActiveGame()
  return (
    <ErrorBoundary>
      <AppShell game={game}>{game ? <ScreenFor key={game.id} game={game} /> : <HomeScreen />}</AppShell>
      <Toaster />
    </ErrorBoundary>
  )
}

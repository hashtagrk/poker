import type { Player } from '../../lib/types'
import { CharacterAvatar } from '../ui'
import './players.css'

type PlayerIdentityProps = {
  player: Player
  size?: number
  surface?: 'paper' | 'felt'
  animated?: boolean
}

export function PlayerIdentity({ player, size = 44, surface = 'paper', animated = true }: PlayerIdentityProps) {
  return (
    <span className="player-identity">
      <CharacterAvatar character={player.character} seat={player.seat} size={size} surface={surface} animated={animated} />
      <span className="player-identity__text">
        <span className="player-identity__name">{player.name}</span>
        {player.title && <span className="player-identity__title">{player.title}</span>}
      </span>
    </span>
  )
}

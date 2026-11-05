import { useState, type FormEvent } from 'react'
import { CHARACTERS } from '../../lib/characters'
import { MAX_PLAYER_NAME_LENGTH, MAX_TITLE_LENGTH } from '../../lib/game'
import type { CharacterId, Game, Player } from '../../lib/types'
import { useGameStore } from '../../store/gameStore'
import { Button, CharacterAvatar, Dialog, Field } from '../ui'
import './players.css'

type PlayerEditorDialogProps = {
  game: Game
  player: Player | null
  onClose: () => void
}

function PlayerEditorForm({ game, player, onClose }: { game: Game; player: Player; onClose: () => void }) {
  const updatePlayer = useGameStore((state) => state.updatePlayer)
  const [name, setName] = useState(player.name)
  const [title, setTitle] = useState(player.title ?? '')
  const [character, setCharacter] = useState<CharacterId>(player.character)
  const taken = new Set(game.players.filter((other) => other.id !== player.id).map((other) => other.character))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (updatePlayer(game.id, player.id, { name, title, character })) onClose()
  }

  return (
    <>
      <form className="stack" onSubmit={submit} id="player-editor">
        <Field label="Name">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={MAX_PLAYER_NAME_LENGTH}
              required
              autoFocus
            />
          )}
        </Field>
        <Field label="Title" hint="A table nickname, like “The Shark” or “River Rat”.">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={MAX_TITLE_LENGTH}
              aria-describedby={describedBy}
              placeholder="Optional"
            />
          )}
        </Field>
        <fieldset className="character-picker">
          <legend className="field__label">Character</legend>
          <div className="character-picker__grid">
            {CHARACTERS.map((definition) => (
              <label
                key={definition.id}
                className={`character-option ${taken.has(definition.id) ? 'character-option--taken' : ''}`}
                title={definition.description}
              >
                <input
                  type="radio"
                  name="character"
                  value={definition.id}
                  checked={character === definition.id}
                  onChange={() => setCharacter(definition.id)}
                  className="sr-only"
                />
                <CharacterAvatar character={definition.id} size={44} animated={character === definition.id} />
                <span className="character-option__name">{definition.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
      <footer className="dialog__footer">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="player-editor">
          Save
        </Button>
      </footer>
    </>
  )
}

export function PlayerEditorDialog({ game, player, onClose }: PlayerEditorDialogProps) {
  return (
    <Dialog open={player !== null} title="Edit player" onClose={onClose}>
      {player && <PlayerEditorForm key={player.id} game={game} player={player} onClose={onClose} />}
    </Dialog>
  )
}

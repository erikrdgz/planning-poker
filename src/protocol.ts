export const CARDS = ['0', '1', '2', '3', '5', '8', '13', 'coffee'] as const
export type Card = (typeof CARDS)[number]
export const AVATARS = [
  '🐻',
  '🐱',
  '🐸',
  '🦊',
  '🐼',
  '🐨',
  '🐰',
  '🐯',
  '🦁',
  '🐧',
  '🐙',
  '🦋',
]
export interface Player {
  id: string
  avatar: number
  seat: number
  vote: Card | null
}
export interface Room {
  players: Player[]
  host: string
  revealed: boolean
  round: number
  consensus: Card | null
}
export interface Snapshot {
  type: 'state'
  you: string
  host: string
  revealed: boolean
  round: number
  consensus: Card | null
  players: (Omit<Player, 'vote'> & { voted: boolean; vote?: Card | null })[]
}
export function view(room: Room, you: string): Snapshot {
  return {
    type: 'state',
    you,
    host: room.host,
    revealed: room.revealed,
    round: room.round,
    consensus: room.consensus,
    players: room.players.map((p) => ({
      id: p.id,
      avatar: p.avatar,
      seat: p.seat,
      voted: p.vote !== null,
      ...(room.revealed || p.id === you ? { vote: p.vote } : {}),
    })),
  }
}
export function act(
  room: Room,
  id: string,
  message: { type?: unknown; card?: unknown; avatar?: unknown },
): boolean {
  const player = room.players.find((p) => p.id === id)
  if (!player) return false
  if (
    message.type === 'vote' &&
    !room.revealed &&
    CARDS.includes(message.card as Card)
  ) {
    player.vote = message.card as Card
    return true
  }
  if (
    message.type === 'avatar' &&
    Number.isInteger(message.avatar) &&
    Number(message.avatar) >= 0 &&
    Number(message.avatar) < AVATARS.length
  ) {
    player.avatar = Number(message.avatar)
    return true
  }
  if (id !== room.host) return false
  if (
    message.type === 'reveal' &&
    !room.revealed &&
    room.players.some((p) => p.vote !== null)
  ) {
    room.revealed = true
    room.consensus =
      room.players.length >= 2 &&
      room.players.every(
        (p) => p.vote !== null && p.vote === room.players[0].vote,
      )
        ? room.players[0].vote
        : null
    return true
  }
  if (message.type === 'reset') {
    room.revealed = false
    room.consensus = null
    room.round++
    room.players.forEach((p) => (p.vote = null))
    return true
  }
  return false
}

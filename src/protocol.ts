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
export interface Discussion {
  status: 'offered' | 'running' | 'dismissed'
  endsAt: number | null
  duration: number
}
export interface Ticket {
  title: string
  url: string
}
export function ticketUrl(value: string): string | null {
  if (!value.trim()) return ''
  try {
    const url = new URL(value.trim())
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
export interface Room {
  players: Player[]
  host: string
  revealed: boolean
  round: number
  consensus: Card | null
  celebrationAt: number
  ticket: Ticket
  discussion: Discussion | null
}
export interface Snapshot {
  type: 'state'
  serverNow: number
  you: string
  host: string
  revealed: boolean
  round: number
  consensus: Card | null
  celebrationAt: number
  ticket: Ticket
  discussion: Discussion | null
  players: (Omit<Player, 'vote'> & { voted: boolean; vote?: Card | null })[]
}
export function view(room: Room, you: string): Snapshot {
  return {
    type: 'state',
    serverNow: Date.now(),
    ticket: room.ticket,
    discussion: room.discussion,
    celebrationAt: room.celebrationAt,
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
  message: {
    type?: unknown
    card?: unknown
    avatar?: unknown
    seconds?: unknown
    title?: unknown
    url?: unknown
  },
  now = Date.now(),
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
  if (message.type === 'ticket-update') {
    if (
      typeof message.title !== 'string' ||
      typeof message.url !== 'string' ||
      message.title.length > 160 ||
      message.url.length > 2048
    )
      return false
    const url = ticketUrl(message.url)
    if (url === null) return false
    room.ticket = { title: message.title.trim(), url }
    return true
  }
  if (message.type === 'celebrate' && now - room.celebrationAt >= 2000) {
    room.celebrationAt = now
    return true
  }
  if (
    message.type === 'reveal' &&
    !room.revealed &&
    room.players.some((p) => p.vote !== null)
  ) {
    room.revealed = true
    room.discussion = room.players.some((p) => p.vote === 'coffee')
      ? { status: 'offered', endsAt: null, duration: 0 }
      : null
    room.consensus =
      room.players.length >= 2 &&
      room.players.every(
        (p) => p.vote !== null && p.vote === room.players[0].vote,
      )
        ? room.players[0].vote
        : null
    return true
  }
  if (
    message.type === 'timer-start' &&
    room.revealed &&
    room.discussion?.status === 'offered' &&
    typeof message.seconds === 'number' &&
    Number.isInteger(message.seconds) &&
    message.seconds >= 30 &&
    message.seconds <= 600 &&
    message.seconds % 30 === 0
  ) {
    room.discussion = {
      status: 'running',
      endsAt: now + Number(message.seconds) * 1000,
      duration: Number(message.seconds),
    }
    return true
  }
  if (message.type === 'timer-dismiss' && room.revealed && room.discussion) {
    room.discussion = { ...room.discussion, status: 'dismissed', endsAt: null }
    return true
  }
  if (message.type === 'reset') {
    room.ticket = { title: '', url: '' }
    room.discussion = null
    room.revealed = false
    room.consensus = null
    room.round++
    room.players.forEach((p) => (p.vote = null))
    return true
  }
  return false
}

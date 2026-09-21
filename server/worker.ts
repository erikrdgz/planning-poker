import { DurableObject } from 'cloudflare:workers'
import { act, view, type Room, type Player } from '../src/protocol'
const GRACE = 60_000
const LEAVING = 4000
const PING = '{"type":"ping"}'
const PONG = '{"type":"pong"}'
interface Env {
  PUBLIC_APP_ORIGIN?: string
  ROOMS: DurableObjectNamespace<PokerRoom>
  ASSETS: Fetcher
}
interface Attachment {
  token: string
  id: string
  last: number
}
// A seat belongs to a token, not to a socket. `away` is the moment the socket
// went quiet; null means someone is sitting in it right now.
interface Seat {
  id: string
  away: number | null
}
interface Stored {
  room: Room
  seats: [string, Seat][]
}
function emptyRoom(): Room {
  return {
    players: [],
    host: '',
    round: 1,
    revealed: false,
    consensus: null,
    discussion: null,
    ticket: { title: '', url: '' },
    profilesEnabled: false,
    celebrationAt: 0,
  }
}
export class PokerRoom extends DurableObject<Env> {
  room: Room = emptyRoom()
  seats = new Map<string, Seat>()
  sockets = new Map<WebSocket, Attachment>()
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Idle connections are dropped by phones and proxies long before anyone
    // has stopped thinking, so answer heartbeats without waking the room.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<Stored>('room')
      if (stored) {
        this.room = stored.room
        this.seats = new Map(stored.seats)
      }
      for (const ws of ctx.getWebSockets())
        this.sockets.set(ws, ws.deserializeAttachment() as Attachment)
      // A restart kills sockets without a closing handshake. Start the grace
      // period for anyone left behind so no seat is held by a ghost.
      const now = Date.now()
      for (const seat of this.seats.values())
        if (!this.connected(seat.id)) seat.away ??= now
      this.schedule()
      this.save()
    })
  }
  async fetch(request: Request) {
    const url = new URL(request.url)
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return new Response('WebSocket required', { status: 426 })
    const token = url.searchParams.get('token') ?? ''
    if (!/^[0-9a-f-]{36}$/.test(token))
      return new Response('Invalid participant', { status: 400 })
    if (!this.room.players.length && url.searchParams.get('create') !== '1')
      return new Response('This room has ended. Create a new room.', {
        status: 404,
      })
    const held = this.seats.get(token)
    const returning = held && this.room.players.find((p) => p.id === held.id)
    if (!returning && this.room.players.length >= 25)
      return new Response('This room is full (25 people).', { status: 409 })
    for (const [ws, data] of this.sockets)
      if (data.token === token) {
        this.sockets.delete(ws)
        ws.close(1000, 'Joined from another tab')
      }
    const player = returning ?? {
      id: crypto.randomUUID(),
      avatar: Math.floor(Math.random() * 12),
      seat: Math.max(0, ...this.room.players.map((p) => p.seat)) + 1,
      vote: null,
    }
    if (!returning) this.room.players.push(player)
    this.seats.set(token, { id: player.id, away: null })
    if (!this.room.host) this.room.host = player.id
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    const data: Attachment = { token, id: player.id, last: 0 }
    server.serializeAttachment(data)
    this.sockets.set(server, data)
    this.schedule()
    this.broadcast()
    return new Response(null, { status: 101, webSocket: client })
  }
  connected(id: string) {
    return [...this.sockets.values()].some((data) => data.id === id)
  }
  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const data = this.sockets.get(ws)
    if (!data || typeof raw !== 'string' || raw.length > 4096) return
    const now = Date.now()
    if (now - data.last < 60) return
    data.last = now
    try {
      const message = JSON.parse(raw)
      if (
        message &&
        typeof message === 'object' &&
        act(this.room, data.id, message)
      )
        this.broadcast()
    } catch {
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'That action could not be read.',
        }),
      )
    }
  }
  webSocketClose(ws: WebSocket, code: number) {
    this.part(ws, code === LEAVING)
  }
  webSocketError(ws: WebSocket) {
    this.part(ws, false)
  }
  // Leaving on purpose empties the seat at once. Anything else holds it, and
  // the card already on the table, until the grace period runs out.
  part(ws: WebSocket, deliberate: boolean) {
    const data = this.sockets.get(ws)
    if (!data) return
    this.sockets.delete(ws)
    const seat = this.seats.get(data.token)
    if (deliberate) this.drop(data.id)
    else if (seat) seat.away = Date.now()
    this.schedule()
    this.broadcast()
  }
  drop(id: string) {
    for (const [token, seat] of this.seats)
      if (seat.id === id) this.seats.delete(token)
    this.room.players = this.room.players.filter((p) => p.id !== id)
    if (this.room.host === id)
      this.room.host =
        this.room.players.find((p) => this.connected(p.id))?.id ??
        this.room.players[0]?.id ??
        ''
    if (!this.room.players.length) {
      this.room = emptyRoom()
      this.seats.clear()
    }
  }
  schedule() {
    const due = Math.min(
      ...[...this.seats.values()]
        .filter((seat) => seat.away !== null)
        .map((seat) => seat.away! + GRACE),
    )
    if (Number.isFinite(due)) this.ctx.storage.setAlarm(due)
    else this.ctx.storage.deleteAlarm()
  }
  async alarm() {
    const now = Date.now()
    for (const seat of [...this.seats.values()])
      if (seat.away !== null && now - seat.away >= GRACE) this.drop(seat.id)
    this.schedule()
    this.broadcast()
  }
  save() {
    if (!this.room.players.length) this.ctx.storage.deleteAll()
    else
      this.ctx.storage.put<Stored>('room', {
        room: this.room,
        seats: [...this.seats],
      })
  }
  broadcast() {
    this.save()
    for (const [ws, data] of this.sockets) {
      try {
        ws.send(JSON.stringify(view(this.room, data.id)))
      } catch {
        /* Close/error handler removes disconnected participants. */
      }
    }
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      const origin = request.headers.get('Origin')
      if (origin && origin !== url.origin && origin !== env.PUBLIC_APP_ORIGIN)
        return new Response('Origin rejected', { status: 403 })
      const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9-]{36})$/)
      if (!match) return new Response('Not found', { status: 404 })
      return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request)
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

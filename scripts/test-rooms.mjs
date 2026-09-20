import assert from 'node:assert/strict'
const base = process.env.POKER_TEST_URL ?? 'ws://localhost:8787'
const room = crypto.randomUUID()
const clients = []
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(check) {
  for (let i = 0; i < 150; i++) {
    if (check()) return
    await delay(20)
  }
  throw Error('Timed out waiting for room state')
}
async function connect(create = false, id = crypto.randomUUID()) {
  const ws = new WebSocket(
    `${base}/api/rooms/${room}?token=${id}${create ? '&create=1' : ''}`,
  )
  const client = { ws, id, state: null }
  ws.addEventListener('message', (e) => {
    client.state = JSON.parse(e.data)
  })
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(Error('connection rejected')), {
      once: true,
    })
  })
  clients.push(client)
  await until(() => client.state)
  client.id = client.state.you
  return client
}
function send(c, type, extra = {}) {
  c.ws.send(JSON.stringify({ type, ...extra }))
}
try {
  const host = await connect(true)
  for (let i = 0; i < 24; i++) await connect()
  await until(() => host.state.players.length === 25)
  await assert.rejects(() => connect(), /rejected/)
  await assert.rejects(() => connect(false, host.id), /rejected/)
  assert.equal(host.ws.readyState, WebSocket.OPEN)
  const guest = clients[1]
  send(guest, 'vote', { card: '13' })
  await until(() => host.state.players.find((p) => p.id === guest.id)?.voted)
  assert.equal(
    'vote' in host.state.players.find((p) => p.id === guest.id),
    false,
  )
  await delay(80)
  send(guest, 'reveal')
  await delay(100)
  assert.equal(host.state.revealed, false)
  for (const c of clients) {
    send(c, 'vote', { card: '5' })
    await delay(70)
  }
  await until(() => host.state.players.every((p) => p.voted))
  send(host, 'reveal')
  await until(() => clients.every((c) => c.state.revealed))
  assert.equal(host.state.consensus, '5')
  assert(host.state.players.every((p) => p.vote === '5'))
  await delay(80)
  send(guest, 'reset')
  await delay(100)
  assert.equal(host.state.revealed, true)
  send(host, 'reset')
  await until(() => clients.every((c) => c.state.round === 2))
  assert(host.state.players.every((p) => !p.voted))
  assert.equal(host.state.consensus, null)
  await delay(80)
  send(guest, 'vote', { card: 'coffee' })
  await until(() => host.state.players.find((p) => p.id === guest.id).voted)
  assert.equal(host.state.discussion, null)
  send(host, 'reveal')
  await until(() =>
    clients.every((c) => c.state.discussion?.status === 'offered'),
  )
  await delay(80)
  send(guest, 'timer-start', { seconds: 600 })
  await delay(100)
  assert.equal(host.state.discussion.status, 'offered')
  send(host, 'timer-start', { seconds: 600 })
  await until(() =>
    clients.every((c) => c.state.discussion?.status === 'running'),
  )
  assert(
    clients.every(
      (c) => c.state.discussion.endsAt === host.state.discussion.endsAt,
    ),
  )
  assert.equal(host.state.discussion.duration, 600)
  await delay(80)
  send(host, 'timer-dismiss')
  await until(() =>
    clients.every((c) => c.state.discussion?.status === 'dismissed'),
  )
  await delay(80)
  send(host, 'reset')
  await until(() => clients.every((c) => c.state.discussion === null))
  await delay(80)
  send(guest, 'celebrate')
  await delay(100)
  assert.equal(host.state.celebrationAt, 0)
  send(host, 'celebrate')
  await until(() => clients.every((c) => c.state.celebrationAt > 0))
  assert(
    clients.every((c) => c.state.celebrationAt === host.state.celebrationAt),
  )
  host.ws.close()
  await until(() => guest.state.host === guest.id)
  console.log(
    'PASS: 25 players, capacity rejection, private payloads, host-only reveal/reset, consensus, round clearing, host transfer, shared 10-minute timer, timer dismissal and reset, host-only shared confetti.',
  )
} finally {
  for (const c of clients) c.ws.close()
}

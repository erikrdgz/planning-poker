import { describe, it, expect } from 'vitest'
import { act, view, type Room } from './protocol'
function fixture(): Room {
  return {
    players: [
      { id: 'host', avatar: 0, seat: 1, vote: null },
      { id: 'guest', avatar: 1, seat: 2, vote: null },
    ],
    host: 'host',
    round: 1,
    revealed: false,
    consensus: null,
    discussion: null,
    ticket: { title: '', url: '' },
    profilesEnabled: false,
    celebrationAt: 0,
  }
}
describe('private voting and host authority', () => {
  it('never sends other hidden card values, including to the host', () => {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: '13' })
    expect(view(r, 'host').players[1]).not.toHaveProperty('vote')
    expect(view(r, 'host').players[1].voted).toBe(true)
    expect(view(r, 'guest').players[1].vote).toBe('13')
  })
  it('rejects guest reveal and reset without changing votes', () => {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: '5' })
    expect(act(r, 'guest', { type: 'reveal' })).toBe(false)
    expect(act(r, 'guest', { type: 'reset' })).toBe(false)
    expect(r.players[1].vote).toBe('5')
    expect(r.revealed).toBe(false)
  })
  it('allows one changeable vote and freezes cards after reveal', () => {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: '3' })
    act(r, 'guest', { type: 'vote', card: '5' })
    act(r, 'host', { type: 'reveal' })
    expect(act(r, 'guest', { type: 'vote', card: '8' })).toBe(false)
    expect(view(r, 'host').players[1].vote).toBe('5')
  })
  it('celebrates only complete agreement from at least two players', () => {
    const r = fixture()
    act(r, 'host', { type: 'vote', card: 'coffee' })
    act(r, 'host', { type: 'reveal' })
    expect(r.consensus).toBe(null)
    act(r, 'host', { type: 'reset' })
    for (const p of r.players) act(r, p.id, { type: 'vote', card: 'coffee' })
    act(r, 'host', { type: 'reveal' })
    expect(r.consensus).toBe('coffee')
    act(r, 'host', { type: 'reset' })
    expect(r.consensus).toBe(null)
    expect(r.players.every((p) => p.vote === null)).toBe(true)
    expect(r.round).toBe(3)
  })
  it('does not celebrate disagreement or a solo vote', () => {
    const r = fixture()
    act(r, 'host', { type: 'vote', card: '3' })
    act(r, 'guest', { type: 'vote', card: '5' })
    act(r, 'host', { type: 'reveal' })
    expect(r.consensus).toBe(null)
    r.players.pop()
    act(r, 'host', { type: 'reset' })
    act(r, 'host', { type: 'vote', card: '3' })
    act(r, 'host', { type: 'reveal' })
    expect(r.consensus).toBe(null)
  })
  it('rejects invalid cards, unknown participants, and invalid avatars', () => {
    const r = fixture()
    for (const card of ['21', 3, null, '<script>'])
      expect(act(r, 'guest', { type: 'vote', card })).toBe(false)
    expect(act(r, 'unknown', { type: 'vote', card: '3' })).toBe(false)
    expect(act(r, 'guest', { type: 'avatar', avatar: 99 })).toBe(false)
  })
})

describe('coffee discussion timer', () => {
  it('offers only after revealing coffee and lets the host decline', () => {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: 'coffee' })
    expect(view(r, 'host').discussion).toBe(null)
    expect(act(r, 'host', { type: 'timer-start', seconds: 180 })).toBe(false)
    act(r, 'host', { type: 'reveal' })
    expect(r.discussion?.status).toBe('offered')
    expect(act(r, 'guest', { type: 'timer-dismiss' })).toBe(false)
    act(r, 'host', { type: 'timer-dismiss' })
    expect(r.discussion?.status).toBe('dismissed')
  })
  it('shares a fixed deadline, rejects guest starts, and clears on reset', () => {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: 'coffee' })
    act(r, 'host', { type: 'reveal' })
    expect(act(r, 'guest', { type: 'timer-start', seconds: 180 })).toBe(false)
    expect(act(r, 'host', { type: 'timer-start', seconds: 10 })).toBe(false)
    act(r, 'host', { type: 'timer-start', seconds: 180 }, 1000)
    expect(view(r, 'guest').discussion?.endsAt).toBe(181000)
    expect(act(r, 'host', { type: 'timer-start', seconds: 300 })).toBe(false)
    act(r, 'host', { type: 'reset' })
    expect(r.discussion).toBe(null)
  })
})

it('accepts slider boundaries and rejects invalid timer durations', () => {
  for (const seconds of [30, 180, 330, 600]) {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: 'coffee' })
    act(r, 'host', { type: 'reveal' })
    expect(act(r, 'host', { type: 'timer-start', seconds }, 1000)).toBe(true)
    expect(r.discussion?.endsAt).toBe(1000 + seconds * 1000)
  }
  for (const seconds of [0, 29, 31, 601, NaN, '180', null]) {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: 'coffee' })
    act(r, 'host', { type: 'reveal' })
    expect(act(r, 'host', { type: 'timer-start', seconds })).toBe(false)
  }
})

it('allows the host to open and reopen a timer after any reveal', () => {
  const r = fixture()
  expect(act(r, 'host', { type: 'timer-offer' })).toBe(false)
  act(r, 'host', { type: 'vote', card: '3' })
  act(r, 'host', { type: 'reveal' })
  expect(r.discussion).toBeNull()
  expect(act(r, 'guest', { type: 'timer-offer' })).toBe(false)
  expect(act(r, 'host', { type: 'timer-offer' })).toBe(true)
  expect(act(r, 'host', { type: 'timer-start', seconds: 600 })).toBe(true)
  act(r, 'host', { type: 'timer-dismiss' })
  expect(act(r, 'host', { type: 'timer-offer' })).toBe(true)
  expect(act(r, 'host', { type: 'timer-start', seconds: 30 })).toBe(true)
  expect(act(r, 'host', { type: 'timer-offer' })).toBe(true)
  expect(r.discussion?.status).toBe('offered')
  expect(act(r, 'host', { type: 'celebrate' })).toBe(false)
})

it('only the host can set ticket details and resets clear them', () => {
  const r = fixture()
  const m = {
    type: 'ticket-update',
    title: ' PROJ-42 Improve search ',
    url: 'https://example.atlassian.net/browse/PROJ-42',
  }
  expect(act(r, 'guest', m)).toBe(false)
  expect(act(r, 'host', m)).toBe(true)
  expect(view(r, 'guest').ticket.title).toBe('PROJ-42 Improve search')
  expect(view(r, 'guest').ticket.url).toBe(m.url)
  act(r, 'host', { type: 'reset' })
  expect(r.ticket).toEqual({ title: '', url: '' })
})
it('rejects unsafe or oversized ticket links', () => {
  const r = fixture()
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,test',
    'https://user:pass@example.com',
    'not a url',
    'https://example.com/' + 'a'.repeat(2050),
  ])
    expect(
      act(r, 'host', { type: 'ticket-update', title: 'Ticket', url }),
    ).toBe(false)
  expect(
    act(r, 'host', { type: 'ticket-update', title: 'Title only', url: '' }),
  ).toBe(true)
})

it('emits a shared celebration on reveal for every matching card including zero and coffee', () => {
  for (const card of ['0', '1', '2', '3', '5', '8', '13', 'coffee']) {
    const r = fixture()
    for (const p of r.players) act(r, p.id, { type: 'vote', card })
    expect(r.celebrationAt).toBe(0)
    act(r, 'host', { type: 'reveal' }, 10000)
    expect(r.consensus).toBe(card)
    expect(view(r, 'host').celebrationAt).toBe(10000)
    expect(view(r, 'guest').celebrationAt).toBe(10000)
    expect(act(r, 'host', { type: 'reveal' }, 12000)).toBe(false)
    expect(r.celebrationAt).toBe(10000)
  }
})
it('does not celebrate incomplete votes or disagreement', () => {
  for (const card of [null, '8']) {
    const r = fixture()
    act(r, 'host', { type: 'vote', card: '5' })
    if (card) act(r, 'guest', { type: 'vote', card })
    act(r, 'host', { type: 'reveal' }, 10000)
    expect(r.celebrationAt).toBe(0)
  }
})

describe('optional participant profiles', () => {
  it('defaults to anonymous and only allows the host to enable profiles', () => {
    const r = fixture()
    expect(view(r, 'guest').profilesEnabled).toBe(false)
    expect(act(r, 'guest', { type: 'profiles-setting', enabled: true })).toBe(
      false,
    )
    expect(
      act(r, 'guest', {
        type: 'profile-update',
        name: 'Alex',
        position: 'Designer',
      }),
    ).toBe(false)
    expect(act(r, 'host', { type: 'profiles-setting', enabled: true })).toBe(
      true,
    )
    expect(
      act(r, 'guest', {
        type: 'profile-update',
        name: ' Alex ',
        position: 'Designer',
      }),
    ).toBe(true)
    expect(view(r, 'host').players[1]).toMatchObject({
      name: 'Alex',
      position: 'Designer',
    })
    expect(r.players[0].name).toBeUndefined()
    act(r, 'host', { type: 'reset' })
    expect(r.profilesEnabled).toBe(true)
    expect(r.players[1].name).toBe('Alex')
    act(r, 'host', { type: 'profiles-setting', enabled: false })
    expect(r.players[1].name).toBeUndefined()
    expect(view(r, 'guest').players[1]).not.toHaveProperty('position')
    act(r, 'host', { type: 'profiles-setting', enabled: true })
    expect(r.players[1].name).toBeUndefined()
  })
  it('rejects invalid profiles and permits clearing optional fields', () => {
    const r = fixture()
    act(r, 'host', { type: 'profiles-setting', enabled: true })
    expect(
      act(r, 'guest', {
        type: 'profile-update',
        name: 'a'.repeat(61),
        position: '',
      }),
    ).toBe(false)
    expect(
      act(r, 'guest', {
        type: 'profile-update',
        name: '',
        position: 'a'.repeat(81),
      }),
    ).toBe(false)
    expect(
      act(r, 'guest', { type: 'profile-update', name: 123, position: '' }),
    ).toBe(false)
    expect(
      act(r, 'guest', { type: 'profile-update', name: '', position: '' }),
    ).toBe(true)
  })
})

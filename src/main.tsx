import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  PartyPopper,
  ArrowUpRight,
  Check,
  ChevronRight,
  Coffee,
  Copy,
  Eye,
  Layers2,
  LogOut,
  RotateCcw,
  Settings2,
  Users,
  X,
} from 'lucide-react'
import { AVATARS, CARDS, ticketUrl, type Card, type Snapshot } from './protocol'
import './style.css'

const backgrounds = [
  { id: 'daylight', name: 'Daylight', color: '#eff1fc' },
  { id: 'sky', name: 'Contour', color: '#d9f0fc' },
  { id: 'peach', name: 'Sunroom', color: '#ffe7d7' },
  { id: 'mint', name: 'Graph paper', color: '#d9f2e6' },
]
function CardFace({ value }: { value: Card }) {
  return value === 'coffee' ? (
    <Coffee aria-label="Coffee — let’s discuss" />
  ) : (
    <>{value}</>
  )
}
const roomsAvailable =
  import.meta.env.BASE_URL === '/' || !!import.meta.env.VITE_ROOM_SERVER_URL
function App() {
  const [room, setRoom] = useState<Snapshot | null>(null)
  const [code, setCode] = useState(
    () => new URLSearchParams(location.search).get('room') ?? '',
  )
  const [editingTicket, setEditingTicket] = useState(false)
  const [ticketTitle, setTicketTitle] = useState('')
  const [ticketLink, setTicketLink] = useState('')
  const [ticketError, setTicketError] = useState('')
  const [join, setJoin] = useState('')
  const [connection, setConnection] = useState<
    'idle' | 'connecting' | 'connected' | 'error'
  >('idle')
  const [timerSeconds, setTimerSeconds] = useState(180)
  const [now, setNow] = useState(Date.now())
  const serverOffset = useRef(0)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState('daylight')
  const [dark, setDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const [customize, setCustomize] = useState(false)
  const [avatar, setAvatar] = useState(0)
  const [copied, setCopied] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const socket = useRef<WebSocket | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const seenCelebration = useRef('')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const id = useRef(crypto.randomUUID())
  const creating = useRef(false)
  const me = room?.players.find((p) => p.id === room.you)
  const host = room?.host === room?.you && !!room
  const voted = room?.players.filter((p) => p.voted).length ?? 0
  const chosen = me?.vote ?? null
  const discussion = room?.discussion
  const remaining = Math.max(
    0,
    Math.ceil(((discussion?.endsAt ?? 0) - now) / 1000),
  )
  useEffect(() => {
    if (discussion?.status !== 'running') return
    const tick = setInterval(
      () => setNow(Date.now() + serverOffset.current),
      250,
    )
    return () => clearInterval(tick)
  }, [discussion?.status, discussion?.endsAt])
  useEffect(() => {
    if (!code) return
    if (!roomsAvailable) {
      setConnection('error')
      setError(
        'Live rooms are not connected yet. The room server is awaiting setup.',
      )
      return
    }
    let active = true
    setConnection('connecting')
    setError('')
    const url = new URL(
      `/api/rooms/${code}`,
      import.meta.env.VITE_ROOM_SERVER_URL || location.origin,
    )
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('token', id.current)
    if (creating.current) url.searchParams.set('create', '1')
    const ws = new WebSocket(url)
    socket.current = ws
    ws.onmessage = (e) => {
      if (!active) return
      const message = JSON.parse(e.data)
      if (message.type === 'state') {
        serverOffset.current = message.serverNow - Date.now()
        setNow(Date.now() + serverOffset.current)
        setRoom(message)
        setConnection('connected')
        setError('')
        creating.current = false
      } else if (message.type === 'error') setError(message.message)
    }
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'avatar', avatar }))
    }
    ws.onclose = () => {
      if (active) {
        setConnection('error')
        setError(
          'Connection closed. The room may have ended, reached 25 people, or gone offline. Rejoin or start a new room.',
        )
      }
    }
    ws.onerror = () => {
      if (active) {
        setConnection('error')
        setError(
          'Couldn’t connect to this room. Check your connection and try again.',
        )
      }
    }
    return () => {
      active = false
      ws.close()
      socket.current = null
    }
    // Avatar is sent on connect and changed separately while connected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])
  useEffect(() => {
    if (customize) dialog.current?.showModal()
    else dialog.current?.close()
  }, [customize])
  useEffect(() => {
    const manual =
      !!room?.celebrationAt &&
      Date.now() + serverOffset.current - room.celebrationAt < 1900
    const key = manual
      ? `${code}-party-${room.celebrationAt}`
      : `${code}-${room?.round}`
    if (
      (!manual && (!room?.consensus || !room.revealed)) ||
      seenCelebration.current === key
    )
      return
    seenCelebration.current = key
    setCelebrate(true)
    const timer = setTimeout(() => setCelebrate(false), 1900)
    return () => {
      clearTimeout(timer)
      setCelebrate(false)
    }
  }, [room?.consensus, room?.revealed, room?.round, room?.celebrationAt, code])
  useEffect(() => () => clearTimeout(copyTimer.current), [])
  function send(type: string, extra = {}) {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify({ type, ...extra }))
  }
  function start() {
    if (!roomsAvailable) return
    creating.current = true
    const next = crypto.randomUUID()
    history.replaceState(null, '', `?room=${next}`)
    setRoom(null)
    setCode(next)
  }
  function leave() {
    socket.current?.close()
    history.replaceState(null, '', location.pathname)
    setCode('')
    setRoom(null)
    setConnection('idle')
    setError('')
  }
  function enter() {
    if (!roomsAvailable) return
    let value = join.trim()
    try {
      value = new URL(value).searchParams.get('room') ?? value
    } catch {}
    if (!/^[a-f0-9-]{36}$/.test(value)) {
      setError('Paste a room link or its complete room code.')
      return
    }
    creating.current = false
    history.replaceState(null, '', `?room=${value}`)
    setCode(value)
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copy the room link from your browser’s address bar.')
    }
  }
  return (
    <div className={`app theme-${theme} ${dark ? 'dark' : 'light'}`}>
      <header className="header">
        <a
          className="brand"
          href={location.pathname}
          onClick={(e) => {
            e.preventDefault()
            leave()
          }}
          aria-label="Common Ground"
        >
          <span className="brand-mark">
            <Layers2 size={22} />
          </span>
          <span>
            common ground<span className="brand-caption">PLANNING POKER</span>
          </span>
        </a>
        <div className="header-actions">
          <span className="no-accounts">
            Good estimates start with a conversation.
          </span>
          <button
            className="icon-button"
            onClick={() => setCustomize(true)}
            aria-label="Customize your space"
          >
            <Settings2 size={20} />
          </button>
          {code && (
            <button
              className="icon-button"
              onClick={leave}
              aria-label="Leave room"
            >
              <LogOut size={20} />
            </button>
          )}
        </div>
      </header>
      <main>
        {!code ? (
          <section className="lobby">
            <div className="lobby-copy">
              <span className="eyebrow">
                <span className="tiny-dot" />A LITTLE ROOM FOR YOUR TEAM
              </span>
              <h1>
                Different perspectives.
                <br />
                <span>Common ground.</span>
              </h1>
              <p>
                Pick a card. Reveal together. Make room for the conversation
                that gets everyone on the same page.
              </p>
              <button
                disabled={!roomsAvailable}
                className="primary create-button"
                onClick={start}
              >
                Create a room <ArrowUpRight size={20} />
              </button>
              {!roomsAvailable && (
                <p className="hosting-notice" role="status">
                  The interface is live. Shared rooms are coming once the room
                  server is connected.
                </p>
              )}
              <div className="join-form">
                <label htmlFor="join">Already invited?</label>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    enter()
                  }}
                >
                  <input
                    id="join"
                    value={join}
                    onChange={(e) => setJoin(e.target.value)}
                    placeholder="Paste your room link"
                    required
                  />
                  <button
                    disabled={!roomsAvailable}
                    aria-label="Join room"
                    type="submit"
                  >
                    <ChevronRight size={20} />
                  </button>
                </form>
              </div>
              <div className="lobby-notes">
                <span>
                  <Users size={15} /> Up to 25 people
                </span>
                <span>
                  <Check size={15} /> No accounts. No history.
                </span>
              </div>
            </div>
            <div
              className="lobby-preview"
              aria-label="Planning poker card collection"
            >
              <div className="orbit-label">
                <span>✦</span> A fresh perspective at every seat.
              </div>
              <div className="fan">
                <div className="sample-card sample-one">
                  <span>3</span>
                  <strong>3</strong>
                  <span>3</span>
                </div>
                <div className="sample-card sample-two">
                  <span>5</span>
                  <strong>5</strong>
                  <span>5</span>
                </div>
                <div className="sample-card sample-three">
                  <Coffee size={20} />
                  <Coffee size={50} />
                  <Coffee size={20} />
                </div>
              </div>
              <div className="preview-avatars">
                {[3, 2, 0, 5].map((a) => (
                  <span key={a}>{AVATARS[a]}</span>
                ))}
                <p>Everyone has a seat at the table.</p>
              </div>
            </div>
          </section>
        ) : (
          <section className="workspace">
            <div className="room-heading">
              <div>
                <div className="eyebrow">
                  YOUR SHARED SPACE{' '}
                  <span className="room-code">
                    {code.slice(0, 8).toUpperCase()}
                  </span>
                </div>
                <h1>
                  Let’s think together<span className="heading-dot">.</span>
                </h1>
              </div>
              <div className="room-actions">
                {host && (
                  <button
                    className="secondary party-button"
                    disabled={connection !== 'connected' || celebrate}
                    onClick={() => send('celebrate')}
                    aria-label="Celebrate with everyone"
                    title="Confetti for everyone"
                  >
                    <PartyPopper size={18} />
                    <span>Celebrate</span>
                  </button>
                )}
                <button
                  className={`secondary ${copied ? 'copy-confirmed' : ''}`}
                  onClick={copy}
                >
                  {copied ? <Check size={17} /> : <Copy size={17} />}{' '}
                  {copied ? 'Link copied' : 'Invite teammates'}
                </button>
              </div>
            </div>
            <section className="ticket-panel" aria-label="Current Jira ticket">
              <div className="ticket-summary">
                <div>
                  <span className="eyebrow">ON THE TABLE</span>
                  <h2>{room?.ticket?.title || 'No ticket selected yet'}</h2>
                  {!room?.ticket?.title && (
                    <p>
                      {host
                        ? 'Add a title and Jira link to give this round some context.'
                        : 'Your host will add the ticket for this round.'}
                    </p>
                  )}
                </div>
                <div className="ticket-actions">
                  {room?.ticket?.url && (
                    <a
                      className="jira-link"
                      href={room.ticket.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        src={`${import.meta.env.BASE_URL}jira.svg`}
                        width="18"
                        height="18"
                        alt=""
                      />
                      Open on Jira
                      <ArrowUpRight size={16} />
                    </a>
                  )}
                  {host && (
                    <button
                      className="secondary"
                      disabled={connection !== 'connected'}
                      onClick={() => {
                        setTicketTitle(room?.ticket?.title ?? '')
                        setTicketLink(room?.ticket?.url ?? '')
                        setTicketError('')
                        setEditingTicket(!editingTicket)
                      }}
                    >
                      {editingTicket
                        ? 'Cancel'
                        : room?.ticket?.title
                          ? 'Edit ticket'
                          : 'Add ticket'}
                    </button>
                  )}
                </div>
              </div>
              {host && editingTicket && (
                <form
                  className="ticket-editor"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const url = ticketUrl(ticketLink)
                    if (url === null) {
                      setTicketError(
                        'Enter a full https:// or http:// Jira ticket link.',
                      )
                      return
                    }
                    send('ticket-update', { title: ticketTitle, url })
                    setEditingTicket(false)
                    setTicketError('')
                  }}
                >
                  <label>
                    Ticket title
                    <input
                      autoFocus
                      maxLength={160}
                      value={ticketTitle}
                      onChange={(e) => setTicketTitle(e.target.value)}
                      placeholder="PROJ-42 · Improve the search experience"
                    />
                  </label>
                  <label>
                    Jira ticket link
                    <input
                      type="url"
                      maxLength={2048}
                      value={ticketLink}
                      onChange={(e) => setTicketLink(e.target.value)}
                      placeholder="https://your-team.atlassian.net/browse/PROJ-42"
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={connection !== 'connected'}
                    type="submit"
                  >
                    Save ticket
                  </button>
                  {ticketError && <p role="alert">{ticketError}</p>}
                </form>
              )}
            </section>
            <div className="workspace-grid">
              <section className="table-panel">
                <div className="table-toolbar">
                  <span key={room?.round} className="round-pill round-change">
                    ROUND {room?.round ?? 1}
                  </span>
                  <span className="privacy-label">
                    <Eye size={15} />
                    {room?.revealed
                      ? 'Cards are revealed'
                      : 'Your vote stays private'}
                  </span>
                </div>
                <div className="table-scene">
                  <div className="poker-table" aria-live="polite">
                    <span className="table-emblem">
                      <Layers2 size={26} />
                    </span>
                    <h2>
                      {connection !== 'connected'
                        ? 'Getting everyone together…'
                        : room?.revealed
                          ? room.consensus
                            ? 'You found common ground!'
                            : 'Let’s talk it through.'
                          : voted === room?.players.length && voted > 0
                            ? 'The cards are in.'
                            : 'A little thinking space.'}
                    </h2>
                    <p>
                      {room?.revealed
                        ? room.consensus === 'coffee'
                          ? 'Coffee and a conversation. That’s a plan.'
                          : room.consensus
                            ? `Everyone chose ${room.consensus}. Nice alignment.`
                            : 'Different estimates are where good conversations begin.'
                        : `${voted} of ${room?.players.length ?? 0} cards are in`}
                    </p>
                    <div
                      className="vote-progress"
                      aria-label={`${voted} votes received`}
                    >
                      {(room?.players ?? []).map((p) => (
                        <span key={p.id} className={p.voted ? 'filled' : ''} />
                      ))}
                    </div>
                    {host ? (
                      <button
                        disabled={
                          connection !== 'connected' ||
                          (!room?.revealed && !voted)
                        }
                        className="primary"
                        onClick={() =>
                          send(room?.revealed ? 'reset' : 'reveal')
                        }
                      >
                        {room?.revealed ? (
                          <RotateCcw size={17} />
                        ) : (
                          <Eye size={17} />
                        )}{' '}
                        {room?.revealed ? 'Start next round' : 'Reveal cards'}
                      </button>
                    ) : (
                      <span className="waiting-label">
                        {room?.revealed
                          ? 'Your host will start the next round.'
                          : 'Your host will reveal when you’re ready.'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="seats" aria-label="Team cards">
                  {room?.players.map((p) => (
                    <div
                      className={`seat ${p.id === room.you ? 'my-seat' : ''}`}
                      key={p.id}
                    >
                      <div
                        key={`${room.round}-${room.revealed}-${p.voted}`}
                        className={`mini-card ${room.revealed ? 'is-revealed' : p.voted ? 'is-voted' : ''}`}
                      >
                        {room.revealed ? (
                          p.vote ? (
                            <CardFace value={p.vote} />
                          ) : (
                            <span>—</span>
                          )
                        ) : p.voted ? (
                          <Layers2 size={22} />
                        ) : (
                          <span className="thinking-dots">···</span>
                        )}
                      </div>
                      <span className="seat-avatar">{AVATARS[p.avatar]}</span>
                      <span className="seat-name">
                        {p.id === room.you ? 'You' : `Player ${p.seat}`}
                        {p.id === room.host && <small>HOST</small>}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              <aside className="team-panel">
                <div className="team-title">
                  <h2>At the table</h2>
                  <span>{room?.players.length ?? 0}/25</span>
                </div>
                <p className="team-intro">Fresh eyes. Independent estimates.</p>
                <div className="team-list">
                  {room?.players.map((p) => (
                    <div className="team-person" key={p.id}>
                      <span className={`avatar avatar-${p.avatar % 4}`}>
                        {AVATARS[p.avatar]}
                      </span>
                      <div>
                        <strong>
                          {p.id === room.you ? 'You' : `Player ${p.seat}`}
                        </strong>
                        <span>
                          {p.id === room.host ? 'Room host' : 'Team member'}
                        </span>
                      </div>
                      <span
                        className={`person-status ${p.voted ? 'has-vote' : ''}`}
                        aria-label={p.voted ? 'Voted' : 'Thinking'}
                      >
                        {p.voted ? <Check size={15} /> : <span>···</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  className="customize-link"
                  onClick={() => setCustomize(true)}
                >
                  <Settings2 size={16} /> Make yourself at home{' '}
                  <ChevronRight size={16} />
                </button>
                <div className="team-tip">
                  <Coffee size={20} />
                  <p>
                    More questions than answers?
                    <br />
                    The coffee card makes space to talk.
                  </p>
                </div>
              </aside>
            </div>
            {discussion && discussion.status !== 'dismissed' && (
              <section className="coffee-break" aria-label="Coffee discussion">
                <div className="coffee-stamp">
                  <Coffee size={32} />
                  <span>
                    COFFEE
                    <br />& CLARITY
                  </span>
                </div>
                <div className="coffee-copy">
                  <span className="eyebrow">A PAUSE WITH PURPOSE</span>
                  <h2>
                    {discussion.status === 'offered'
                      ? 'Someone’s got a question.'
                      : remaining > 0
                        ? 'Let it brew.'
                        : 'Time’s up. Where did we land?'}
                  </h2>
                  <p>
                    {discussion.status === 'offered'
                      ? 'A little space to unpack the unknowns. Timebox it, or let the conversation flow.'
                      : remaining > 0
                        ? 'Explore the uncertainty. The estimate can wait.'
                        : 'Wrap up the thought, then give the next estimate a go.'}
                  </p>
                </div>
                {discussion.status === 'running' && (
                  <div
                    className="brew-clock"
                    role="timer"
                    aria-label="Discussion time remaining"
                  >
                    <strong>
                      {Math.floor(remaining / 60)}
                      <span>:</span>
                      {String(remaining % 60).padStart(2, '0')}
                    </strong>
                    <div className="brew-progress">
                      <i
                        style={{
                          transform: `scaleX(${remaining / discussion.duration})`,
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="coffee-actions">
                  {host ? (
                    discussion.status === 'offered' ? (
                      <>
                        <div className="timer-picker">
                          <label htmlFor="discussion-duration">
                            Time to talk{' '}
                            <output>
                              {Math.floor(timerSeconds / 60)}:
                              {String(timerSeconds % 60).padStart(2, '0')}
                            </output>
                          </label>
                          <input
                            id="discussion-duration"
                            type="range"
                            min="30"
                            max="600"
                            step="30"
                            value={timerSeconds}
                            aria-valuetext={`${Math.floor(timerSeconds / 60)} minutes ${timerSeconds % 60} seconds`}
                            onChange={(e) =>
                              setTimerSeconds(Number(e.target.value))
                            }
                          />
                          <div className="range-labels">
                            <span>30 sec</span>
                            <span>10 min</span>
                          </div>
                          <button
                            className="primary"
                            disabled={connection !== 'connected'}
                            onClick={() =>
                              send('timer-start', { seconds: timerSeconds })
                            }
                          >
                            Start timer
                          </button>
                        </div>
                        <button
                          className="text-button"
                          disabled={connection !== 'connected'}
                          onClick={() => send('timer-dismiss')}
                        >
                          Talk without a timer
                        </button>
                      </>
                    ) : (
                      <button
                        className="text-button"
                        disabled={connection !== 'connected'}
                        onClick={() => send('timer-dismiss')}
                      >
                        {remaining > 0 ? 'End timer' : 'Dismiss timer'}
                      </button>
                    )
                  ) : (
                    <span>
                      {discussion.status === 'offered'
                        ? 'Your host can start or skip the timer.'
                        : 'A shared pause for everyone.'}
                    </span>
                  )}
                </div>
              </section>
            )}
            <section className="deck-panel">
              <div className="deck-heading">
                <div>
                  <h2>
                    {room?.revealed
                      ? 'Every perspective counts.'
                      : 'What’s your estimate?'}
                  </h2>
                  <p>
                    {room?.revealed
                      ? 'Talk it through, then start fresh.'
                      : chosen === 'coffee'
                        ? 'Coffee selected. Let’s make space for discussion.'
                        : chosen
                          ? `${chosen} selected. You can change your mind until reveal.`
                          : 'Go with your instinct. You can change it until the reveal.'}
                  </p>
                </div>
                <span className="deck-tag">FIBONACCI · STORY POINTS</span>
              </div>
              <div className="deck" aria-label="Choose an estimate">
                {CARDS.map((value, index) => (
                  <button
                    key={value}
                    className={`estimate-card ${chosen === value ? 'selected' : ''} ${value === 'coffee' ? 'coffee-card' : ''}`}
                    style={
                      {
                        '--i': index,
                        '--tilt': `${(index - 3.5) * 1.6}deg`,
                        '--arc': `${Math.pow(index - 3.5, 2) * 1.5}px`,
                      } as React.CSSProperties
                    }
                    aria-label={
                      value === 'coffee'
                        ? 'Coffee — let’s discuss'
                        : `${value} story points`
                    }
                    aria-pressed={chosen === value}
                    disabled={room?.revealed || connection !== 'connected'}
                    onClick={() => send('vote', { card: value })}
                  >
                    <span className="card-corner">
                      <CardFace value={value} />
                    </span>
                    <strong>
                      <CardFace value={value} />
                    </strong>
                    <span className="card-bottom">
                      {chosen === value ? (
                        <Check size={16} />
                      ) : value === 'coffee' ? (
                        'DISCUSS'
                      ) : (
                        'POINTS'
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </section>
        )}
        {error && (
          <div className="error-message" role="alert">
            {error}
            {code && (
              <button
                onClick={() => {
                  const retry = code
                  setCode('')
                  setTimeout(() => setCode(retry), 0)
                }}
              >
                Try again
              </button>
            )}
          </div>
        )}
      </main>
      <footer>
        <span>Independent thoughts. Better conversations.</span>
        <span>
          Made for a little more togetherness{' '}
          <span className="footer-flower">✳</span>
        </span>
      </footer>
      <dialog
        aria-label="Customize your space"
        ref={dialog}
        onCancel={() => setCustomize(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setCustomize(false)
        }}
      >
        <div className="dialog-header">
          <div>
            <span className="eyebrow">YOUR CORNER OF THE ROOM</span>
            <h2>Make yourself at home.</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close customization"
            onClick={() => setCustomize(false)}
          >
            <X size={20} />
          </button>
        </div>
        <p>Choose a face. Keep your name to yourself.</p>
        <div className="avatar-picker">
          {AVATARS.map((a, i) => (
            <button
              key={a}
              aria-label={`Choose ${a} avatar`}
              aria-pressed={(me?.avatar ?? avatar) === i}
              className={(me?.avatar ?? avatar) === i ? 'active' : ''}
              onClick={() => {
                setAvatar(i)
                send('avatar', { avatar: i })
              }}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="appearance-setting">
          <div>
            <h3>Dark mode</h3>
            <p>A softer glow for late sessions.</p>
          </div>
          <button
            className="mode-switch"
            role="switch"
            aria-checked={dark}
            aria-label="Dark mode"
            onClick={() => setDark(!dark)}
          >
            <span />
          </button>
        </div>
        <h3>Set the scene</h3>
        <p>Coordinated backgrounds, just for you.</p>
        <div className="background-picker">
          {backgrounds.map((bg) => (
            <button
              key={bg.id}
              className={theme === bg.id ? 'active' : ''}
              aria-pressed={theme === bg.id}
              onClick={() => setTheme(bg.id)}
            >
              <span
                className={`scene-swatch swatch-${bg.id}`}
                style={{ '--swatch': bg.color } as React.CSSProperties}
              >
                {theme === bg.id && <Check size={20} />}
              </span>
              {bg.name}
            </button>
          ))}
        </div>
        <button
          className="primary dialog-done"
          onClick={() => setCustomize(false)}
        >
          Looks like me <Check size={17} />
        </button>
      </dialog>
      {celebrate && (
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 60 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  '--x': `${[26, 50, 74][Math.floor(i / 20)]}%`,
                  '--y': `${[43, 32, 46][Math.floor(i / 20)]}%`,
                  '--dx': `${Math.cos(((i % 20) * Math.PI) / 10 + Math.floor(i / 20) * 0.27) * (20 + ((i * 7) % 17))}vmin`,
                  '--dy': `${Math.sin(((i % 20) * Math.PI) / 10 + Math.floor(i / 20) * 0.27) * (20 + ((i * 7) % 17))}vmin`,
                  '--delay': `${Math.floor(i / 20) * 0.16}s`,
                  '--rotation': `${i * 43}deg`,
                  '--color': ['#6260e8', '#f5b950', '#69bca2', '#ee879e'][
                    i % 4
                  ],
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)

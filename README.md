# Common Ground

A small, anonymous Planning Poker room for up to 25 Agile teammates. Built with React, TypeScript, Vite, and Cloudflare Workers.

## Local development

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run build
npm run dev:server
```

In a second terminal, run `npm run dev`. Open the Vite URL. The Vite proxy connects the React UI to the local room server on port 8787. Alternatively, open port 8787 to use the last production build directly.

```sh
npm test
npm run build
npm run format:check
node scripts/test-rooms.mjs # with the local room server running
```

## How it works

- Create a room and invite teammates with its link. No accounts or real names.
- Pick one card: 0, 1, 2, 3, 5, 8, 13, or coffee for discussion. Change it until reveal.
- Each player receives their own vote; everyone else's value is omitted from the server response until the host reveals.
- Only the host can reveal or reset. A new round clears every vote.
- Matching votes from every participant (at least two) trigger confetti for 1.9 seconds. Reduced-motion preferences suppress it.
- Twelve emoji avatars and four personal backgrounds. Anonymous player numbers differentiate matching avatars.
- If the host leaves, hosting transfers to the next connected player. A reconnect is a new participant if its previous connection has already closed. Active duplicate connections with the same private connection token replace the old connection.
- Rooms end when everyone disconnects. A new host must create a new room. Joining mid-reveal shows the current result; that participant votes in the next round.

## Temporary state, no database

Each room is a Cloudflare Durable Object using hibernating WebSockets. Participant metadata and current votes live in active WebSocket attachments so idle rooms can hibernate; there are **no application database, file, localStorage, or sessionStorage writes**. The SQLite-compatible namespace is required for the Cloudflare free plan, but the application never calls its storage APIs. Closing all connections removes the live room state. Hosting infrastructure may retain operational metadata under the provider's policies; this is not a claim of zero infrastructure logging.

Room links are unguessable UUIDs. Anyone who has the link may join. Names are never requested; avatar/seat identities remain visible so teams can see who has voted. The host also cannot inspect other hidden votes through normal application messages.

## Hosting and Git

This follows Bloom's lightweight project setup: a standalone Git repository, npm lockfile, strict TypeScript, focused tests, formatting checks, and GitHub Actions. The full application deploys to Cloudflare because GitHub Pages cannot run the room server.

1. Use a **Cloudflare Workers Free** account. No paid plan is needed for the app's architecture; quotas still apply.
2. Run `npx wrangler login`, then `npm run deploy` for the first deployment.
3. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub production environment secrets and set the repository variable `CLOUDFLARE_DEPLOY_ENABLED` to `true` to enable deployment from `main`. The deployment job stays skipped until configured. Use a token restricted to deploying Workers to your account.
4. Cloudflare assigns a `workers.dev` URL. Link it from the portfolio after deployment is verified.

The free plan has daily request and compute quotas; this is suitable for a portfolio and occasional team refinement, not a promise of unlimited free usage. See [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/). Hibernation limits idle compute usage.

## Structure

- `src/main.tsx`: room creation/joining, shared table, voting, avatars, backgrounds.
- `src/style.css`: responsive light themes, card motion, reduced-motion support.
- `src/protocol.ts`: shared types, host permissions, redacted snapshots, round logic.
- `server/worker.ts`: WebSocket rooms, 25-player limit, host transfer, temporary state.
- `.github/workflows`: checks and production deployment.

## Portfolio framing

Built a lightweight Planning Poker tool to help Agile teams independently estimate complexity, compare perspectives, and spend more time on the conversations that build shared understanding. Features support this intended value; reductions in administrative work and other team outcomes have not yet been measured.

## License and credits

MIT. React (MIT), Vite and Vitest (MIT), Lucide (ISC). DM Sans and Manrope are served by Google Fonts under the SIL Open Font License; system fonts are available as fallbacks. Avatars use the device's native emoji artwork.

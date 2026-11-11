# Statify AI

Statify AI turns everyday actions into cards, plans and a visible record of personal growth. Its AI companion helps create and manage those cards, reads relevant activity history, remembers preferences when asked, and helps compare products before a user-approved PayPal Sandbox checkout.

**Demo:** https://ai.mystatify.com/  
**Source:** https://github.com/shuzi2026/Statify-AI  
**License:** [GNU AGPL v3.0 only](LICENSE)

## Project scope

This is a standalone Web project derived from Statify v0.3.0. The card, planning, progression, journal and local-storage foundations existed before this AI project. The competition work adds the AI companion and its user-confirmed tools, preference memory, Channel3 product search and comparison, PayPal Sandbox checkout, shopping cards and receipts, and a standalone hosted demo.

The repository includes the application, backend, tests, build tools and registered artwork needed to run this version. It does not include account or payment credentials, real user data, private development notes, original repository history, or production-server configuration. The original Statify commercial services are not required for the hackathon demo.

## What the demo does

- Enter as a guest and keep cards, plans, journals and purchase receipts in this browser.
- Ask the AI to draft a card or plan, inspect the draft, and confirm before it changes your data.
- Read relevant records through bounded, read-only AI queries.
- Ask the AI to remember a preference, then retrieve or clear it when memory is enabled.
- Search the US product catalog through Channel3, compare offers, and confirm a PayPal Sandbox payment.

**Payment boundary:** Channel3 supplies product information. PayPal Sandbox processes a test payment to the configured sandbox merchant. This demo does not place a real order with a retailer, arrange shipping, or charge a live payment account. Use PayPal Sandbox buyer credentials, never a real buyer account. A successful catalog query is not evidence that checkout completed.

## Requirements

- Node.js 24 and npm.
- Git for cloning and for the optional local developer Agent. ZIP downloads can run the app, but the developer Agent needs a Git checkout.
- An OpenAI API project and key. The configured model must be available to that project.
- A Channel3 API key.
- A PayPal developer sandbox application, its client ID and secret, and a sandbox buyer for checkout testing.

External services have their own terms and usage costs. This repository does not provide API credit, credentials or access to commercial Statify accounts. Set spending limits in the API provider's account; in-app visitor limits are not a hard total spending cap.

## Quick start: local hackathon preview

```sh
npm ci
```

Create `.env.ai-global.local` containing:

```dotenv
STATIFY_OPENAI_API_KEY_GLOBAL=your_openai_api_key
STATIFY_OPENAI_MODEL_GLOBAL=gpt-6.1-sol
```

Create `.env.paypal-channel3.local` containing:

```dotenv
CHANNEL3_API_KEY=your_channel3_api_key
PAYPAL_SANDBOX_CLIENT_ID=your_sandbox_client_id
PAYPAL_SANDBOX_CLIENT_SECRET=your_sandbox_client_secret
```

Then run:

```sh
npm run start:hackathon
```

The package manifest pins the install-script allowlist for better-sqlite3, esbuild and opencode-ai for npm versions that require it. These scripts install the native SQLite binding and development/build tools.

Open http://127.0.0.1:15287/. The preview runs only on the loopback interface and uses its own browser storage. It does not connect to the commercial account backend. Keep the development server running while testing a sandbox checkout. Restart it after changing environment variables.

Other development modes remain available: `npm start` for the Chinese preview at port 15284, and `npm run start:global` for the international preview at port 15286. They use independent browser stores. For Chinese AI, put `STATIFY_OPENAI_API_KEY_CN` and optional `STATIFY_OPENAI_MODEL_CN` in `.env.development.local`.

## Run the standalone hosted build

```sh
npm run build:hackathon
```

Copy `.env.example` to `.env.statify-hosted.local` and fill in your own credentials. For a local build test, leave `STATIFY_HOSTED_ORIGIN=http://127.0.0.1:15288`. Generate the signing key once:

```sh
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

Use the result for `STATIFY_DEMO_SIGNING_KEY`, then run:

```sh
npm run start:hosted
```

Open http://127.0.0.1:15288/. The compiled frontend and backend share one origin. For a public deployment, set `STATIFY_HOSTED_ORIGIN` to your complete HTTPS origin and use a reverse proxy to the loopback Node service. Preserve the Host header, disable response buffering for streamed AI replies, and allow at least 60 seconds for upstream responses. Install dependencies on the target operating system; do not copy Windows `node_modules` to Linux.

Only expose the compiled `output/build/hackathon/web/` content through the provided server. Do not expose the source checkout or environment files. Keep the signing key stable between restarts so existing sessions and pending signed orders remain verifiable. The hosted server has no developer Agent endpoint.

### Preference memory

Set `STATIFY_MEMORY_DIR` to a private writable directory to enable Mem0 OSS with SQLite. The OpenAI project also supplies embeddings. Ordinary chat, cards and journals are not automatically written to memory; the feature stores preferences the user asks to remember. Keep this directory out of Git and back it up according to your own privacy policy.

For a local first-visit test, after building and configuring credentials run `npm run start:guest-test` and open http://127.0.0.1:15292/. This uses separate local guest memory under ignored `output/guest-memory/`. The Reset guest button clears only that test visitor's browser data and saved preferences after confirmation.

## Optional local developer Agent

The ordinary Chinese/international development previews retain a local OpenCode-based developer Agent. It is disabled in the hackathon preview and hosted server. Configure a local passphrase in `.env.statify-developer-global.local` as `STATIFY_DEV_CHAT_PASSPHRASE_GLOBAL`, or the corresponding `_CN` setting in `.env.statify-developer-cn.local`. It uses the region's OpenAI project by default. Keep this service on loopback.

The developer Agent works in a separate filtered workspace. Review proposed changes before applying them to the main checkout. Its state, passphrase, credentials and private project notes must not be committed.

## Verification

```sh
npm run typecheck
npm test
npm run test:compat
npm run assets:check
npm run build:hackathon
```

Unit tests use synthetic fixtures and mocked external services. They do not prove a real sandbox buyer approval and capture succeeded. For end-to-end testing, use a fresh guest session and verify AI response, confirmed card creation, persistence after refresh, catalog results, sandbox approval, return-to-app receipt, and optional memory persistence. Also verify that a foreign Origin cannot write and that private files and developer endpoints are unavailable from the hosted service.

## Code map

- `src/`, `shared/`: interface, card and planning rules, local storage, AI tools and shopping contracts.
- `scripts/user-chat.ts`, `scripts/user-tool-guide.ts`: AI requests and bounded business tools.
- `scripts/shopping-*.ts`, `scripts/channel3-search.ts`: product search, artwork and sandbox checkout.
- `scripts/hosted-server.ts`, `scripts/hosted-api.ts`: standalone server and request/session checks.
- `scripts/visitor-memory.ts`: optional preference memory.
- `assets/`: registered source artwork; generated Web copies come from `scripts/assets.mjs`.
- `tests/` and colocated `*.test.*`: synthetic regression and compatibility tests.

## License and third-party components

Copyright (C) 2026 shuzi2026. Project code and original project assets are licensed under **AGPL-3.0-only**, except components carrying separate upstream terms. See [LICENSE](LICENSE) for the complete, unmodified license and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency notices, including the Geist fonts under OFL-1.1 and Lucide/Feather icons under their upstream licenses.

AGPL permits commercial use. Its source-sharing obligations also address modified versions made available to users over a network. If you publish a modified hosted version, prominently offer those users its corresponding source as required by section 13. Product names and third-party trademarks identify their owners and do not imply endorsement or a grant of trademark rights. Live catalog content remains subject to its providers' terms.

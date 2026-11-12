# Statify AI

Statify turns your abilities into levels, your physical and mental states into observable values, and your daily actions into cards linked to your growth. Through tracking and immediate feedback, it helps you shift your attention from short-term results to long-term progress.

Building on Statify, Statify AI introduces an AI persona shaped by the data you accumulate over time: a digital extension of yourself that grows alongside you. As it develops, we envision it extending what you can do beyond your physical boundaries: helping you plan tasks and gradually taking on more of the things you may not have the time or ability to do yourself. This could include anticipating your needs, comparing and selecting products, and helping you purchase them through PayPal.

**Demo:** https://ai.mystatify.com/  
**Source:** https://github.com/shuzi2026/Statify-AI  
**License:** [GNU AGPL v3.0 only](LICENSE)

## Try the demo

Explore [Statify AI](https://ai.mystatify.com) and ask your digital persona to help you:

- **Assess your abilities:** Discuss your current skills and establish a starting point for your growth.
- **Turn goals into action cards:** Break a task down into manageable steps and create cards to work on them.
- **Record your journey:** Log your actions and reflections as you make progress.
- **Find and buy a product:** Describe what you need, compare available options, and complete a test purchase through PayPal.
- **Buy a previous purchase again:** Ask your digital persona to help you reorder an item you have purchased before when you need more.

**PayPal Sandbox:** Use a PayPal Sandbox personal buyer account to test checkout. This is a simulated payment: no real money is charged, and no order is placed with a retailer or shipped. Product information comes from Channel3; availability and search results depend on its catalog.

## Demo boundaries and project scope

Channel3 supplies the US product catalog; coverage varies. PayPal Sandbox makes test payments to the configured sandbox merchant, with **no real charges, retailer orders or deliveries**. Never use a real PayPal buyer account.

Built on **Statify v0.3.0**, the project retains its cards, planning, progression, journals and local storage. Hackathon additions connect the digital persona and user-confirmed tools with preference memory, product comparison, Sandbox checkout, shopping cards and receipts in a standalone hosted demo.

The public repository includes the application, backend, tests, build tools and artwork. Credentials, real user data, private notes, original repository history and production-server configuration are excluded. The demo runs independently of Statify's commercial account backend.

## Testing and verification

Recorded on **November 11, 2026**:

- The project owner reported completing sandbox buyer approval and payment capture in the web demo.
- A fresh public clone passed dependency installation, type checking, **709 automated tests**, **22 compatibility checks**, asset checks and the hackathon build.

Automated tests use synthetic fixtures and mocked external services; the manual payment test is separate evidence.

After installing dependencies, run:

```sh
npm run typecheck
npm test
npm run test:compat
npm run assets:check
npm run build:hackathon
```

## Local quick start

You need **Git, Node.js 24 and npm**, an OpenAI API project with access to the configured model, a Channel3 API key, and a PayPal Sandbox application's client ID and secret. Checkout testing also requires a sandbox buyer.

```sh
git clone https://github.com/shuzi2026/Statify-AI.git
cd Statify-AI
npm ci
```

Create `.env.ai-global.local`:

```dotenv
STATIFY_OPENAI_API_KEY_GLOBAL=your_openai_api_key
STATIFY_OPENAI_MODEL_GLOBAL=gpt-6.1-sol
```

Create `.env.paypal-channel3.local`:

```dotenv
CHANNEL3_API_KEY=your_channel3_api_key
PAYPAL_SANDBOX_CLIENT_ID=your_sandbox_client_id
PAYPAL_SANDBOX_CLIENT_SECRET=your_sandbox_client_secret
```

Start the preview:

```sh
npm run start:hackathon
```

Open http://127.0.0.1:15287/. This loopback-only preview has its own browser storage. Keep it running during checkout and restart it after environment changes. Never commit filled-in environment files.

External services have their own terms and costs. Set spending limits with the provider; in-app visitor limits are not a hard total spending cap.

## Standalone hosting and preference memory

The hosted build serves the frontend and backend from one origin. Optional preference memory uses Mem0 OSS with SQLite and OpenAI embeddings; it stores preferences the user asks to remember, rather than automatically saving chats, cards or journals.

See the [deployment guide](docs/deployment.md) for build commands, environment settings, private memory storage and deployment checks.

## Code map

- `src/`, `shared/`: interface, card and planning rules, storage, AI tools and shopping contracts.
- `scripts/user-chat.ts`, `scripts/user-tool-guide.ts`: AI requests and bounded tools.
- `scripts/channel3-search.ts`, `scripts/shopping-comparison.ts`: product search and offer comparison.
- `scripts/shopping-paypal.ts`: sandbox authentication, orders, approval links and capture.
- `scripts/hosted-server.ts`, `scripts/hosted-api.ts`: server and request/session checks.
- `scripts/visitor-memory.ts`: optional preference memory.
- `assets/`, `scripts/assets.mjs`: source artwork and generated Web assets.
- `tests/`, colocated `*.test.*`: regression and compatibility tests.

## Optional local developer Agent

An OpenCode-based developer Agent is available for local development. It is disabled in the hackathon preview and hosted server, and is not needed to evaluate the demo. See the [local developer Agent guide](docs/developer-agent.md) for setup.

## License and third-party components

Copyright (C) 2026 shuzi2026. Project code and original project assets are licensed under **AGPL-3.0-only**, except components carrying separate upstream terms. See [LICENSE](LICENSE) for the complete, unmodified license and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency notices, including the Geist fonts under OFL-1.1 and Lucide/Feather icons under their upstream licenses.

AGPL permits commercial use. Its source-sharing obligations also address modified versions made available to users over a network. If you publish a modified hosted version, prominently offer those users its corresponding source as required by section 13. Product names and third-party trademarks identify their owners and do not imply endorsement or a grant of trademark rights. Live catalog content remains subject to its providers' terms.

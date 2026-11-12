# Standalone deployment

Start with the prerequisites and dependency installation in the [README](../README.md).

## Build and configure

```sh
npm run build:hackathon
```

Copy `.env.example` to `.env.statify-hosted.local` and fill in your own credentials. For a local build test, leave `STATIFY_HOSTED_ORIGIN=http://127.0.0.1:15288`.

Generate a signing key once:

```sh
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

Use the result for `STATIFY_DEMO_SIGNING_KEY`, then run:

```sh
npm run start:hosted
```

Open http://127.0.0.1:15288/. The compiled frontend and backend share one origin. Restart the server after changing environment variables.

## Public deployment

- Set `STATIFY_HOSTED_ORIGIN` to your complete HTTPS origin and use a reverse proxy to the loopback Node service.
- Preserve the Host header, disable response buffering for streamed AI replies, and allow at least 60 seconds for upstream responses.
- Install dependencies on the target operating system. Do not copy Windows `node_modules` to Linux.
- Only expose the compiled `output/build/hackathon/web/` content through the provided server. Do not expose the source checkout or environment files.
- Keep the signing key stable between restarts so existing sessions and pending signed orders remain verifiable.

Set spending limits in your API provider's account. In-app visitor limits are not a hard total spending cap.

## Preference memory

Set `STATIFY_MEMORY_DIR` to a private writable directory to enable Mem0 OSS with SQLite. The OpenAI project also supplies embeddings. If the setting is omitted, persistent preference memory is disabled.

The feature stores preferences the user asks to remember. Ordinary chat, cards and journals are not automatically written to memory. Keep the directory out of Git and back it up according to your own privacy policy.

### Fresh guest testing

After building and configuring credentials, run:

```sh
npm run start:guest-test
```

Open http://127.0.0.1:15292/. This uses separate local guest memory under ignored `output/guest-memory/`. The Reset guest button clears only that test visitor's browser data and saved preferences after confirmation.

## Deployment checks

Use a fresh guest session and verify:

- AI response and confirmed card creation.
- Browser data persistence after refresh.
- Channel3 catalog results.
- PayPal Sandbox buyer approval, payment capture and the return-to-app receipt.
- Preference persistence when memory is enabled.
- Requests from a foreign Origin cannot write.
- Private files and developer endpoints are unavailable from the hosted service.

Automated checks are listed in the [README](../README.md#testing-and-verification). Rerun relevant checks after code or configuration changes.

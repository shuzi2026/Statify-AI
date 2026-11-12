# Local developer Agent

The optional OpenCode-based developer Agent is a local development tool. Use a Git checkout; a ZIP download can run the application but does not provide the Git workspace required by the Agent.

## Setup

Install dependencies and configure the OpenAI project as described in the [README](../README.md#local-quick-start).

Create `.env.statify-developer-global.local` containing a local passphrase:

```dotenv
STATIFY_DEV_CHAT_PASSPHRASE_GLOBAL=choose_a_private_local_passphrase
```

The Agent uses the configured OpenAI project by default. Start the development preview:

```sh
npm run start:global
```

Open http://127.0.0.1:15286/. This preview uses a separate browser store from the hackathon preview. Keep the service on loopback.

## Working safely

The Agent works in a separate filtered workspace. Review proposed changes before applying them to the main checkout. Its state, passphrase, credentials and private project notes must not be committed.

## Installation note

The package manifest pins the install-script allowlist for better-sqlite3, esbuild and opencode-ai for npm versions that require it. These scripts install the native SQLite binding and development/build tools.

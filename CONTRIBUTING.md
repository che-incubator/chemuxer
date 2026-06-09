# Contributing to Chemuxer

## Development Setup

```bash
git clone <repo-url>
cd chemuxer
npm install
npm run dev
```

This starts the backend (tsx watch) and frontend (Vite dev server) concurrently. Open http://localhost:5173.

### Prerequisites

- Node.js 22+
- C++ compiler toolchain for `node-pty`:
  - macOS: `xcode-select --install`
  - Linux: `apt install build-essential` (or equivalent)

## Workflow

### Running Tests

```bash
npm test          # run all tests once
npm run test:watch  # watch mode
```

The test suite uses Vitest with jsdom for client tests and Node environment for server tests.

### Project Structure

```
├── client/          # React frontend (Vite)
│   └── src/
│       ├── components/    # React components
│       ├── hooks/         # Custom hooks
│       ├── contexts/      # React contexts
│       ├── types/         # Client type definitions
│       └── __tests__/     # Client tests
├── server/          # Node.js backend
│   └── src/
│       ├── *.ts           # Server modules
│       └── __tests__/     # Server tests
├── shared/          # Shared types (protocol, settings)
│   └── __tests__/         # Shared tests
└── docs/
    └── adr/         # Architecture Decision Records
```

### Architecture Decision Records

Significant architectural decisions are documented in [`docs/adr/`](docs/adr/README.md). When making a change that involves a meaningful design choice, consider adding or updating an ADR.

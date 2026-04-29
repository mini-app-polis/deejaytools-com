# deejaytools-com-app

React + Vite front-end for deejaytools.com.

## Running locally

Copy `.env.example` to `.env.local` and fill in your Clerk and API URL values, then:

```bash
# Start the development server (hot-reload on http://localhost:5173)
pnpm dev

# Build for production
pnpm build
```

## Other scripts

```bash
pnpm preview       # Serve the production build locally
pnpm typecheck     # Type-check without emitting
pnpm lint          # Run ESLint
pnpm test          # Run tests once
pnpm test:coverage # Run tests with coverage report
```

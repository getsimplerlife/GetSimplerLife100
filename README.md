# Simpler Life 100

Simpler Life 100 deploys vertical-specific AI agents that eliminate operational waste in businesses. We provide pre-mapped, vertical-specific agent blueprints for industries ranging from healthcare and legal to manufacturing and energy.

## Architecture

The project is built with a modern full-stack web architecture:

- **Frontend**: [TanStack Start](https://tanstack.com/start) (React + Vite + Tailwind CSS).
- **SSR/Server**: Vinxi/Nitro running on port 3000.
- **Database**: Turso/SQLite with [Drizzle ORM](https://orm.drizzle.team/) for persistence.
- **Authentication**: `bcryptjs` for password hashing and `jose` for JWT sessions, stored in HTTP-only cookies.
- **Components**:
  - `IndustryLanding`: A reusable component serving 24 vertical-specific industry pages.
  - Interactive Demo Agents: Specialized agents for Energy and Manufacturing verticals.

## Deployment

### Prerequisites
- [Bun](https://bun.sh/) runtime.
- Environment variables:
  - `TEAM_DB_URL`: Turso database connection URL.
  - `TEAM_DB_AUTH_TOKEN`: Turso database auth token.
  - `JWT_SECRET`: Secret key for JWT session signing.

### Local Development
```bash
bun run dev
```
Serves the application with hot reloading.

### Production Build & Serve
The site is hosted on the team platform and managed via `publish.ts`.
```bash
bun run publish
```
This command builds the production assets, kills any existing process on port 3000, starts the server, and polls for readiness.

*Note: Vercel deployment currently has adapter compatibility issues with TanStack Start.*

## API & Server Functions

The application uses TanStack Start server functions (`createServerFn`) located in `src/db/queries.ts`:

- `register`: Email + password user registration.
- `login`: User authentication and session creation.
- `logout`: Session termination.
- `getUser`: Retrieves the currently authenticated user.
- `getAudits`: Lists all audits for the logged-in user.
- `getAudit`: Retrieves details for a specific audit.
- `submitLead`: Processes contact form submissions (writes to `leads.json`).

The site also includes Stripe checkout links for QuickScan™ and Deep Audit™ products.

## Database Schema

Managed via Drizzle ORM and synced with Turso.

- **users**: `id`, `email`, `password`, `created_at`.
- **audits**: `id`, `user_id`, `type` (QuickScan/DeepAudit), `status` (pending/in-progress/completed), `results` (JSON), `deliverable_url`, `created_at`, `updated_at`.

Use the `team-db` CLI for internal SQL queries against the shared Turso instance.

## Project Structure

- `src/routes/`: File-based routing (pages, layouts, and API routes).
- `src/db/`: Database schema, connection setup, and server functions.
- `src/components/`: Reusable React components.
- `src/demos/`: Specialized logic and components for demo agents.

## Troubleshooting

- **500 Errors**: Often caused by `getEvent()` context issues when server functions are called outside of a request context. Fixed with a try-catch wrapper in `getUserInternal`.
- **Vercel Issues**: Vercel may incorrectly detect the project as a static site. TanStack Start requires a Nitro-based serverless environment.
- **Port 3000 Conflicts**: If the server fails to start, ensure port 3000 is free. `publish.ts` handles this automatically.
- **Terminal Issues**: If you see unusual characters or output in the sandbox terminal, try refreshing the session.

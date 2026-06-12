# VTA Farm — Frontend

React 19 + Vite 8 + TypeScript 6 frontend for the VTA Farm identity platform.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io) (`npm install -g pnpm`)

## Local Development

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

3. **Start the dev server**

   ```bash
   pnpm dev
   ```

   The app runs at `http://localhost:5173` with HMR enabled.

4. **Available routes**

   | URL | Description |
   |-----|-------------|
   | `/` | Marketing homepage |
   | `/login` | User sign-in |
   | `/portal` | User portal (agents, create VTA, settings) |
   | `/admin/login` | Admin sign-in |
   | `/admin` | Admin panel (users, security) |

## Other Commands

```bash
pnpm lint        # ESLint
pnpm preview     # Preview the production build locally (serves dist/)
```

## Adding shadcn Components

```bash
pnpm dlx shadcn@latest add <component>
```

Components land in `src/components/ui/`.

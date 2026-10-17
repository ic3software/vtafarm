# VTA Farm — Frontend

The web frontend for VTA Farm, a hosted service for running Verifiable Trust Agents (VTAs). It has two parts:

- **User portal.** Users sign in with a passkey, then create or claim a VTA. They can follow the deployment as it runs and manage their agents, domains, and connection details afterward.
- **Admin panel.** Operators manage users, admins, and invitations. They also handle pre-provisioned VTA pools, resource defaults, image upgrades, and Verifiable Trust Community (VTC) deployments.

The app talks to [vtafarm-api](https://github.com/ic3software/vtafarm-api), which provisions each VTA into its own isolated Kubernetes namespace. [vtafarm-k8s](https://github.com/ic3software/vtafarm-k8s) deploys the whole platform on Hetzner Cloud.

Built with React 19, Vite 8, TypeScript 6, Tailwind CSS v4, and shadcn/ui.

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
pnpm build       # Type-check and build to dist/
pnpm lint        # ESLint
pnpm preview     # Preview the production build locally (serves dist/)
```

## Releasing

Publishing a version to GHCR: [`docs/release.md`](docs/release.md).

## Adding shadcn Components

```bash
pnpm dlx shadcn@latest add <component>
```

Components land in `src/components/ui/`.

## License

VTA Farm is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution.
Contributions are welcome under the terms in [CONTRIBUTING.md](CONTRIBUTING.md).

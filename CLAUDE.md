# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # start dev server
pnpm build        # type-check + build to dist/
pnpm lint         # ESLint
pnpm preview      # preview production build
```

## Tech Stack

- **React 19** + **Vite 8** + **TypeScript 6**
- **Tailwind CSS v4** via `@tailwindcss/vite` (no `tailwind.config.js` — config lives in `src/index.css` under `@theme inline`)
- **shadcn/ui** (`radix-nova` style, CSS variables, `@/components/ui/`)
- **Radix UI** primitives, **Lucide React** icons, **tw-animate-css**
- Path alias: `@/` → `src/`

## Design Reference

The look of the app follows the public site at [vta.farm](https://vta.farm). The site's stylesheet, `public/css/site.css` in the `ic3software/vtafarm-site` repository, is the source of truth for colors, type, corners and controls. **When a value here and on the site disagree, the site is right.**

### Tokens

All tokens live in `src/index.css`. Do not define colors anywhere else, and do not write literal colors in components.

- **Palette**: `--vtafarm-*`, named after the site's tokens (`--vtafarm-bg`, `--vtafarm-surface`, `--vtafarm-ink`, `--vtafarm-line`, `--vtafarm-accent`, `--vtafarm-btn`, `--vtafarm-link` and so on), with light values on `:root` and dark values on `html.dark`.
- **shadcn tokens** (`--primary`, `--muted`, `--border`, etc.) are mapped onto the palette. They hold complete colors, so use `var(--border)` directly and `color-mix(in srgb, var(--primary) 12%, transparent)` for a tint.
- **Status colors**: `--success`, `--warning`, `--destructive`. The site has no opinion on these.
- **Corners**: `--radius-control` (10px, buttons and inputs), `--radius-card` (14px), `--radius-panel` (18px), `--radius-pill`.
- **Motion**: `--ease` (180ms) for hover and state changes.

### Look

- **Accent**: red, `#9d0105` in light and `#da4346` in dark. Filled buttons use `--vtafarm-btn`, which is darker than the accent in dark mode so white text stays readable.
- **Fonts**: IBM Plex Sans (UI), IBM Plex Mono (labels, technical and DID strings), Inter at weight 600 (`--font-heading`, every heading and the large stat figures). Headings are upright and one color: no serif, no italics, no accent-colored words. Hierarchy comes from size and spacing.
- **Buttons**: one primary (filled) and one secondary (1px ink outline that inverts on hover), 10px corners. 52px tall for page-level calls to action, 44px compact, and the portal's denser 36px and 30px.
- **Page titles**: portal and admin pages do not show a title, because the sidebar and breadcrumb already name the page. Keep an `<h1 className="sr-only">` for screen readers. A visible `h1` is only for the name of the thing being viewed (an agent, a pool, a run), in sans.
- **Logo**: `BrandMark` in `src/components/BrandMark.tsx`. The theme switch is `ThemeToggle` in `src/components/ThemeToggle.tsx`.
- **Icons**: Lucide, drawn at a 1.8 stroke.

### `claude-design/`

The HTML mockups in `claude-design/` are the original layout studies for the portal, admin panel and agent interface. They are still a useful reference for how screens are laid out, but **their colors are out of date** (they use a violet primary that never shipped). Take structure from them, never color.

## Adding shadcn Components

```bash
pnpm dlx shadcn@latest add <component>
```

Components land in `src/components/ui/`. Do not hand-edit generated shadcn files unless matching the site's look requires it.

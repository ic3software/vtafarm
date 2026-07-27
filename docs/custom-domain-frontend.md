# Custom Domain Attachment — Frontend Design

Portal UI for two connected things: a standalone **Domains** page where a user
verifies a domain they own, and the **domain picker** that appears in the Full
Stack create flow once a verified domain exists.

Backend counterpart (authority on shapes, statuses and rules):
[`vtafarm-api/docs/custom-domain-design.md`](../../vtafarm-api/docs/custom-domain-design.md).
References like *(API §6.1)* point there.

> **Status: shipped.** Every phase is implemented; §8 tracks the detail.
> The feature stays invisible to users until the API's `CUSTOM_DOMAIN_ENABLED`
> is turned on, which waits on the cluster prerequisites (API §17 phase 0).

---

## 1. Shape of the flow

Domain verification is **separate from session creation**. A user proves they
own a domain once, on its own page; afterwards it is simply an option in the
create form.

```text
Portal ─┬─ Agents
        ├─ Create agent
        └─ Domains          ◄── new nav item
             │
             ├─ (empty)  [ Attach a domain ]
             │
             ├─ pending   ┌──────────────────────────────────────────┐
             │            │  aaa.com                        pending  │
             │            │  1 TXT + 4 CNAME records to create       │
             │            │  per-record ✓ / ✗ with a reason          │
             │            │                        [ Verify DNS ]    │
             │            └──────────────────────────────────────────┘
             │
             └─ verified  ┌──────────────────────────────────────────┐
                          │  aaa.com                       verified  │
                          │  vta / vtc / mediator / dids .aaa.com     │
                          │  Used by: my-agent   ·or·  Not in use     │
                          └──────────────────────────────────────────┘
                                       │
                                       ▼
Create agent → Mode: Full Stack → Domain: [ Managed ▾ | aaa.com ]
                                       │
                                       ▼
                          provisioning starts immediately
                          (DNS is already live — no waiting screen)
```

The payoff of splitting it out: **there is no half-created session parked
waiting for DNS.** By the time a session exists its hostnames already resolve,
so `FullStackCreateProgress` runs exactly as it does today.

---

## 2. New page — `src/pages/portal/DomainsView.tsx`

Route `/portal/domains`, new item in the portal nav.

### 2.1 States

| State | Card contents |
| --- | --- |
| **none** | Short explainer + `[ Attach a domain ]` |
| **pending** | The 5 records, per-record status, `[ Verify DNS ]` |
| **verified, unused** | The four hostnames, "Not in use — select it when creating a Full Stack agent" |
| **verified, in use** | The four hostnames + a link to the session using it |

Because a user may have **at most one custom domain** (API §16.1), this is a
single card, not a list — no pagination, no bulk actions, no empty-list
scaffolding.

### 2.2 Attach

A dialog (`@/components/ui/dialog`) with one input, normalised on change:
lowercase, strip `https://`, strip path, strip trailing `/` and `.`.

On submit, `POST /api/v1/domains` returns the token and the record set; the
card switches to **pending** and shows them.

### 2.3 The records table

```text
┌─ aaa.com                                                   pending ─┐
│  Create these 5 records at your DNS provider.                       │
│                                                                      │
│  TYPE   NAME                      VALUE                      STATUS  │
│  ──────────────────────────────────────────────────────────────────  │
│  TXT    _vtafarm-challenge  [copy] vtafarm-verify=a3f9…[copy]   ✗    │
│  CNAME  vta                 [copy] lb.firstperson.dev  [copy]   ✓    │
│  CNAME  vtc                 [copy] lb.firstperson.dev  [copy]   ✗    │
│  CNAME  mediator            [copy] lb.firstperson.dev  [copy]   …    │
│  CNAME  dids                [copy] lb.firstperson.dev  [copy]   …    │
│                                                                      │
│  ✗ _vtafarm-challenge.aaa.com — no TXT value matches; an older       │
│    token is still present                                            │
│  ✗ vtc.aaa.com — no record found                                     │
│                                                                      │
│  Last checked 12s ago         [ Remove domain ]    [ Verify DNS ]    │
└──────────────────────────────────────────────────────────────────────┘
```

- Everything comes from the backend: `target`, `expected_type`,
  `expected_value`, and every failure `detail`. **The UI never composes DNS
  advice of its own** — one source of truth, and it stays correct as the
  checker improves.
- Both the NAME and VALUE cells are copyable (`useCopyState` in
  `portalUtils.tsx`). The token is long; copy is the only sane path.
- Status glyphs: `✓` passing, `✗` failing with the reason spelled out beneath,
  `…` not yet checked.
- Follow the `EndpointConfigRows` treatment in `FullStackOutputs.tsx` — muted
  card, uppercase mono label, copy button on the right — rather than a real
  `<table>`, so it stays legible on mobile.

### 2.4 Verifying

- `[ Verify DNS ]` → `POST /domains/:id/verify`. Button reads `Verifying…`
  while in flight, then holds a 5s cooldown (the endpoint is rate-limited
  server-side; the cooldown keeps users off the 429).
- Response `verified: true` → card flips to **verified**, with a line pointing
  at the create flow.
- Response `verified: false` → re-render with fresh per-record results. **This
  is the normal path and must not read as an error**: `p-alert alert-warning`,
  never `alert-destructive`.
- Background poll `GET /domains/:id` every 30s while the page is open, so a
  user who fixes DNS in another tab sees ✓ appear on its own. Deliberately
  slower than the 3s session polls elsewhere — each call does real DNS lookups.

### 2.5 Copy that has to be there

Four things users get wrong, so state them on the page:

1. Records live at your DNS provider (registrar, Cloudflare, Route 53…), not in
   VTA Farm.
2. **If your domain is on Cloudflare, all four CNAMEs must be DNS only (grey
   cloud)**, not proxied. (API §6.5 — the only provider-specific instruction
   that exists.)
3. **You can delete the TXT record once verification succeeds.** It's only
   checked at verification time. (API §6.2 — say this, or users leave it
   forever wondering.)
4. New records usually resolve within minutes, but a name checked *before* it
   existed can take up to an hour to clear from public resolvers. (API §6.6)

### 2.6 Removing

`[ Remove domain ]` → `DELETE /domains/:id`. If a session references it the
backend answers 409; surface it as *"This domain is in use by `my-agent`.
Delete that agent first."*

On success, remind the user to delete the four CNAMEs at their provider — a
record left pointing at us is a dangling-DNS liability (API §6.1), and this is
the only moment they'll think about it.

---

## 3. Create form (`src/pages/portal/CreateVTAView.tsx`)

### 3.1 Domain picker

Only for `mode === 'full_stack_with_vtc'`, under the Mode tabs. A `Select`,
not tabs — the option list is data-driven:

| Option | When |
| --- | --- |
| `Managed — firstperson.dev` | always, default |
| `aaa.com` | the caller's domain is verified **and** not already in use |
| `aaa.com (in use by my-agent)`, disabled | verified but backing a session |

With no verified domain, show the single managed option plus a hint linking to
`/portal/domains`. Don't hide the picker — that's how users discover the
feature.

### 3.2 One `label` replaces two name fields

On a fixed-label domain the hostnames carry no user-chosen name (API §4.2):

| Domain | Fields | Hint |
| --- | --- | --- |
| Managed | **Agent name** + **Community name**, both globally unique | `vta-<name>.firstperson.dev` / `vtc-<name>.firstperson.dev` |
| Custom | a single **Label** | `Just for you — it identifies this agent in your list and appears in its DID paths.` |

Same input normalisation as today (`lowercase.replace(/[^a-z0-9-]/g,'-')`,
≤48 chars) — it still lands in `did:webvh` paths. **The "must be unique" copy
must not appear in custom mode**: a 409 on a duplicate label would be a bug
there, not user error. Submitted as `label`.

### 3.3 Immutability warning

Custom selection shows a persistent `p-alert alert-warning` above submit:

> **This can't be changed later.** Your agent's DIDs will permanently embed
> `dids.aaa.com`. Moving to a different domain means creating a new agent from
> scratch.

### 3.4 Hostname hints — drop the hardcoded strings

Two hints hardcode the production managed form, wrong in four of the six API §4
combinations. Add one helper and route every displayed hostname through it:

```ts
// src/pages/portal/portalUtils.tsx
export function componentHost(
  info: DomainInfo,
  component: 'vta' | 'vtc' | 'mediator' | 'dids',
  opts: { fixedLabels: boolean; name?: string; domain?: string },
): string {
  const label = opts.fixedLabels
    ? `${info.env_prefix}${component}`
    : `${info.env_prefix}${component}-${opts.name}`
  return `${label}.${opts.domain ?? info.managed_domain}`
}
```

`env_prefix` comes from `GET /api/v1/setup/domain-info`, so `dev-` appears
automatically against a local API.

### 3.5 Submit

`api.createSession` gains `domain_id?: number` and `label?: string`. Success
behaves identically for both domain kinds — straight into
`FullStackCreateProgress`. There is no intermediate DNS screen, by design (§1).

Footer hint:

| Domain | Hint |
| --- | --- |
| Managed | `4 DNS records are created immediately after session creation.` (today) |
| Custom | `Your domain is already verified — provisioning starts right away.` |

---

## 4. Statuses (`src/pages/portal/portalUtils.tsx`)

Only two additions; `awaiting_dns` from the earlier draft does not exist.

| Status | Class | Label |
| --- | --- | --- |
| `dns_wait` | `badge-warning` | `verifying DNS` |
| `tls_provision` | `badge-warning` | `issuing certificate` |

Both fold into the existing `dns_env` phase, so the stepper keeps its current
shape for every mode:

```ts
{ key: 'dns_env', label: 'DNS & environment',
  statuses: ['dns_provision', 'dns_wait', 'env_provision', 'k8s_provision', 'tls_provision'] },
```

---

## 5. Types (`src/lib/api.ts`)

```ts
export type SetupStatus = /* … */ | 'dns_wait' | 'tls_provision'
export type DomainKind  = 'managed' | 'custom' | 'platform'

export interface PlatformStack {
  exists: boolean
  session_id?: string
  status?: SetupStatus
  label?: string
  urls?: { vta: string; vtc: string; mediator: string; dids: string }
  collected?: { mediator_did?: string; did_hosting_did?: string }
}

export interface DomainInfo {
  managed_domain: string
  env_prefix: string          // "dev-" against a local API, "" in production
  target_ip: string
  target_host?: string        // lb.firstperson.dev
}

export interface DnsRecordStatus {
  component: 'vta' | 'mediator' | 'dids' | 'vtc'
  fqdn: string
  expected_type: 'A' | 'CNAME'
  expected_value: string
  resolved: string[]
  ok: boolean
  detail?: string
}

export interface TxtRecordStatus {
  name: string
  expected: string
  found: string[]
  ok: boolean
  detail?: string
}

export interface Domain {
  id: number
  domain: string
  kind: DomainKind
  verified: boolean
  verified_at?: string
  in_use_by?: string          // session id, when a session references it
  target: string
  txt: TxtRecordStatus
  records: DnsRecordStatus[]
}

// SetupSession gains:
domain_type?: DomainKind
domain?: string
```

```ts
listDomains:  () => req<Domain[]>('GET', '/api/v1/domains'),
attachDomain: (domain: string) => req<Domain>('POST', '/api/v1/domains', { domain }),
getDomain:    (id: number) => req<Domain>('GET', `/api/v1/domains/${id}`),
verifyDomain: (id: number) => req<Domain>('POST', `/api/v1/domains/${id}/verify`),
deleteDomain: (id: number) => req<void>('DELETE', `/api/v1/domains/${id}`),
domainInfo:   () => req<DomainInfo>('GET', '/api/v1/setup/domain-info'),

// admin
getPlatformStack:    () => req<PlatformStack>('GET', '/api/v1/admin/platform-stack'),
createPlatformStack: (data: { label: string; vta_image: string; mediator_image: string;
                              dids_image: string; vtc_image: string }) =>
  req<{ id: string; status: SetupStatus }>('POST', '/api/v1/admin/platform-stack', data),
// `confirm` is required by the API for the platform stack (API §11.1)
adminDeleteSession:  (id: string, confirm?: string) =>
  req<void>('DELETE', `/api/v1/admin/setup-sessions/${id}`, confirm ? { confirm } : undefined),
```

---

## 6. Other views

| View | Change |
| --- | --- |
| `Portal.tsx` | New **Domains** nav item |
| `AgentsView.tsx` | Show each session's domain under its name |
| `SessionDetailView.tsx` | A "Domain" row: the domain plus a `custom` / `managed` / `platform` badge, linking to the Domains page for custom |
| `admin/SessionsView.tsx` | Domain column, plus delete — §6.2 |
| `admin/PlatformStackView.tsx` | New page — §6.1 |

### 6.1 Admin — `src/pages/admin/PlatformStackView.tsx`

A dedicated page in the admin panel for the farm's own full stack on
`firstperson.dev` (API §3.3). It is the only place this can be created, and no
user-facing surface can ever attach that domain.

**Three states, one card:**

| State | Card |
| --- | --- |
| **not created** | Explainer + the four hostnames it *will* claim + `label` (defaults to `firstperson`) + the four image selectors + `[ Create platform stack ]` |
| **provisioning** | The existing `PhaseStepper` + log console, reusing `FullStackCreateProgress` unchanged — it's an ordinary `full_stack_with_vtc` session |
| **running** | The four URLs, plus the **collected values to copy into configuration** (API §3.3.4) |

The running state is the one that needs care. `MEDIATOR_DID` only exists once
the pipeline has minted it, and an operator will be pasting these into env
config, so present them as copyable rows via the existing
`EndpointConfigRows` / `useCopyState` treatment from `FullStackOutputs.tsx`:

```text
MEDIATOR_DID              did:webvh:…:dids.firstperson.dev:firstperson-mediator  [copy]
DID_HOSTING_SERVER_URL    https://dids.firstperson.dev                           [copy]
DID_HOSTING_CONTROL_URL   https://dids.firstperson.dev                           [copy]
```

In development the page behaves identically and shows the `dev-` hostnames —
`dev-vta.firstperson.dev` and friends. Nothing in the UI needs to special-case
this: every hostname comes from `componentHost()` (§3.4), which already applies
`env_prefix`.

Image selectors reuse the same `api.listImages(component)` calls as
`CreateVTAView`. The **beta-access** gate does not appear here (the caller is an
admin), but a **capacity** warning does — same `setupAvailability` treatment as
the user create form, since the platform stack consumes the same resources.

### 6.2 Admin — deleting sessions from `SessionsView`

The admin sessions view is read-only today. Add a delete action per row, backed
by `DELETE /api/v1/admin/setup-sessions/:id` (API §11.1).

**A confirmation dialog is mandatory** — this is a destructive, irreversible
action sitting in a dense table where a mis-click is entirely plausible. Use
`@/components/ui/dialog`; never a bare `confirm()`, and never a delete that
fires straight from the row button.

Two tiers, matching blast radius:

| Target | Dialog |
| --- | --- |
| A user's session | Names the session **and its owner** — "Delete `my-agent` (vincent@…)? This tears down the VTA, mediator, DID hosting and VTC, and cannot be undone." Confirm button is `btn-destructive`. |
| The **platform stack** | Same, plus: "**Every VTA-only session will lose its mediator and DID hosting.**" And a **type-to-confirm** input — the admin types the label before the button enables. |

The type-to-confirm tier is not decoration: the API requires
`{"confirm": "<label>"}` for the platform stack and answers 400 without it
(API §11.1), so the input is what makes the request valid. Don't reimplement
the guard client-side only.

After a successful delete, refresh the list and surface what was torn down
rather than silently removing a row — an admin who mis-clicked should be able
to see immediately what happened.

---

## 7. Design-system notes

Everything reuses primitives already in `src/styles/portal.css` and
`claude-design/app/ui.css`: `p-card`, `p-alert`, `p-input`, `p-mono`, `p-sep`,
`p-badge`, `field-hint`, `btn btn-default` / `btn-outline`, the `Select` and
`Dialog` shadcn components, and `useCopyState`. Per `CLAUDE.md`, consult
`claude-design/` before styling — **no new component is required**.

---

## 8. Implementation order

| Phase | Contents | Depends on |
| --- | --- | --- |
| ✅ **1** | `domain-info` wiring + `componentHost()` + replace the two hardcoded hints | API phase 1 |
| ✅ **2** | Domain picker + `label` field | API phase **3**, not 2 — see below |
| ✅ **3** | `DomainsView` — attach, records table, verify | API phase 3 |
| ✅ **4** | Statuses, agents/detail surfaces | API phase 4 |
| ✅ **A** | `PlatformStackView` (§6.1) + admin session delete with confirmation (§6.2) + types | API phase 2 — **not** blocked on verification or TLS |

Phase 1 is worth shipping alongside the backend's `dev-` rename: without it the
portal shows the wrong hostname to anyone running against a local API.

Phase **A** is deliberately out of the numbered sequence: the platform stack
needs neither domain verification nor certificates, so it only depends on API
phase 2. It can ship well before the custom-domain UI exists — and should, since
it is what makes `vta_only`'s mediator and DID host stable (API §3.3).

> **Correction (2026-07-26): phase 2 depends on API phase 3, not 2.** The domain
> picker reads `GET /domains` and submits `domain_id` / `label` to `POST /setup`
> — all of which arrive in API phase 3. API phase 2 ships only the `domains`
> table and the platform stack, so a picker built against it would have nothing
> to list and no field to submit. What *did* only need API phase 2 was the
> types and phase A, so those shipped together; the picker moves alongside
> `DomainsView` in phase 3, where the two share the same API.

Both gaps phase A left behind are now closed, by the two admin-cookie twins API
phase 3 added: `PlatformStackView` streams the pipeline through
`GET /admin/setup-sessions/{id}/logs`, and names the four hostnames it will
claim from `GET /admin/setup/domain-info` before any of them exist.

One thing phase 3 does that the spec didn't ask for: **`DomainsView` handles the
whole resource 404ing.** `CUSTOM_DOMAIN_ENABLED` defaults to off, so the first
thing most instances return from `GET /domains` is a 404 — rendered as "not
available yet" rather than as a failure. `CreateVTAView` treats the same 404 as
"no domains", which is exactly the right offer.

Phase 4 added one surface beyond §6: **the delete flow tells a custom-domain
user their records survive.** Both the Danger Zone copy and the confirmation
dialog say so — deleting the agent removes nothing from their zone, and that is
the last moment they will think about four CNAMEs still aimed at us.

---

## 9. Open questions

| # | Question | Recommendation |
| --- | --- | --- |
| **F1** | Where does the Domains page live in the nav? | Top level, next to Agents. It's a prerequisite users need to find *before* they start creating an agent, so burying it under Settings would defeat it. |
| **F2** | Auto-verify on an interval, or only on button press? | Both — button plus a 30s background poll while the page is open (§2.4). |
| **F3** | Show the create form's domain picker when the user has no verified domain? | **Yes**, with the managed option selected and a hint linking to Domains. Hiding it removes the only discovery path. |
| **F4** | Let a user swap a running session between managed and custom? | **No.** Delete and recreate — it keeps the immutability rule (API §3.4) absolute. |

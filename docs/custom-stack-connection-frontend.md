# Custom Stack Connection — Frontend Design

Portal UI for two connected things: a **Share** panel on a Full Stack session
that mints and displays a connection bundle, and a **Customize** path in the VTA
Only create flow that accepts one.

Backend counterpart (authority on shapes, statuses and rules):
[`vtafarm-api/docs/custom-stack-connection-design.md`](../../vtafarm-api/docs/custom-stack-connection-design.md).
References like *(API §5.1)* point there.

> **Status: specification. Nothing is built.** §10 tracks it.
> Only stacks running on this farm can be connected to (API §1) — the UI never
> offers to add an arbitrary URL, and §3.3 spells out how it says so when
> somebody tries.
> The API gates Customize behind `beta_access` for its first release
> (API §9.8), so the control is hidden for accounts without it — the same
> treatment Full Stack already gets.

---

## 1. Shape of the flow

Two users, two screens, one clipboard.

```text
── Alice (provider) ────────────────────────────────────────────────────

Portal → Agents → alice (Full Stack, running)
                    │
                    ▼
     ┌─────────────────────────────────────────────────────────┐
     │  Share this stack                                       │
     │                                                         │
     │  Someone with the bundle below can point a VTA Only     │
     │  agent at this stack's mediator and DID hosting.        │
     │                                                         │
     │  Sharing            [ ●───  ] on      [ New code ]      │
     │                                                         │
     │  ┌─────────────────────────────────────────────────┐    │
     │  │ {"v":1,"kind":"vtafarm.stack-connection", …     │    │
     │  └─────────────────────────────────────────────────┘    │
     │                                        [ Copy bundle ]  │
     │                                                         │
     │  Connected agents · 2                                   │
     │    bob-vta     running                                  │
     │    carol-vta   running                                  │
     │    Deleting this stack will stop them working.          │
     └─────────────────────────────────────────────────────────┘
                    │
                    │   (out of band: chat, email, read aloud)
                    ▼
── Bob (consumer) ──────────────────────────────────────────────────────

Portal → Create agent → Mode: [ VTA Only | Full Stack ]
                                    │
                    Connect to:  [ Platform stack | Customize ]
                                    │
                                    ▼
     ┌─────────────────────────────────────────────────────────┐
     │  Paste a connection bundle                              │
     │  ┌─────────────────────────────────────────────────┐    │
     │  │                                                 │    │
     │  └─────────────────────────────────────────────────┘    │
     │                                                         │
     │  ✓ alice · firstperson.dev                              │
     │    mediator  did:webvh:…:mediator-alice.firstperson.dev │
     │    DID host  dids-alice.firstperson.dev                 │
     └─────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                       create → the existing VTA Only
                       stages 1 → 2 → 3, unchanged
```

Everything after the create button is today's `vta_only` flow. This feature adds
exactly one decision to it.

---

## 2. Provider side — the Share panel

Lives in `FullStackOutputs.tsx`, below the endpoint and DID cards. Rendered only
when `status === 'running'` and the API returned a `connection` object
(API §4.3 — absent until the stack has minted its values).

### 2.1 One switch, and what it actually does

The switch writes `PUT /api/v1/setup/:id/sharing`. There is no separate
"generate code" step: turning sharing **on** mints the code, turning it **off**
clears it (API §4.1). **New code** rotates.

| Control | Copy | Confirm? |
| --- | --- | --- |
| Sharing → on | — | no |
| Sharing → off | *"No one new can connect. Agents already connected keep working."* | yes |
| New code | *"The bundle you've already shared stops working. Agents already connected keep working."* | yes |

Both confirms state the same distinction twice, because it is the one thing
people will get wrong: **the code controls who may join, never who is already
in.** There is no way to remove one connection (API §7.4) — the only stronger
lever is deleting the stack, which stops everyone (§2.4). The confirms must not
imply otherwise.

While sharing is off the bundle area is replaced by a single line —
*"Sharing is off. Turn it on to get a bundle you can send."* Rendering a bundle
that would be refused on arrival is worse than rendering nothing.

### 2.2 The bundle

A read-only `<pre>` of the pretty-printed JSON plus a Copy button, reusing
`Row` / `CopyIcon` / `useCopyState` already in `FullStackOutputs.tsx`.

Show the JSON rather than hiding it behind an opaque blob. The recipient is
going to paste it into a form that names a mediator and a host; a sharer who can
read what they are handing over is a sharer who can answer questions about it.

Below it, the values again as individually copyable labelled rows — mediator
DID, DID host, daemon DID, and **the share code on its own**, because it is the
one field short enough to read over a phone call (API §4.1).

### 2.3 Connected agents

From `connections[]` (API §8): name and status badge. Read-only — there is no
per-connection action, because there is no per-connection API (API §7.4).

The list is not decoration; it is the **entire** mitigation for §2.4. Deleting
the stack is allowed and breaks every agent on it, so the person who would click
Delete has to see what that means from the same screen, before the confirm.

Below the list, one line: *"Deleting this stack will stop these agents
working."*

Names and statuses only. The dependents belong to other users; nothing else
about them is Alice's business.

### 2.4 Delete, when connections exist

Delete is **not blocked** (API §7.2). `sessionActions.ts` needs no 409 handling
— the existing type-the-name confirm stays, with one block added when
`connections.length > 0`:

> **2 other people's agents connect to this stack.**
> bob-vta, carol-vta
>
> Deleting it stops them working — they'll be able to see why, but not fix it,
> and they can't be reconnected. Their agents keep running otherwise; nothing of
> theirs is deleted.

Two things that sentence has to get right, because the API relies on the UI to
say them and nowhere else does:

- **They can't be reconnected.** Not a nag — the consumer's `did:webvh` contains
  its host, so there is no path back (§4.2).
- **Nothing of theirs is deleted.** Their pod, PVC and Vault seed are untouched.
  Without this the confirm reads as far more destructive than it is, and an
  owner who believes they are wiping someone's data will not click a button they
  are entitled to click.

---

## 3. Consumer side — the create form

`CreateVTAView.tsx`, inside the `mode === 'vta_only'` branch. A segmented
control — **Platform stack** (default) / **Customize** — above the name and
image fields, because it changes what the rest of the form means.

| Selection | Form state |
| --- | --- |
| Platform stack | today's form, unchanged; POST body has no `connection` |
| Customize | a textarea appears; POST body carries the **parsed** `connection` object |

The frontend parses the pasted text and sends structured JSON, not the raw
string (API §5). Parsing client-side is what makes §3.2 possible.

### 3.1 The availability gate splits — this is the part that must not be missed

`SetupAvailability` gains `vta_only.custom_target_allowed` (API §10.1).

Today `CreateVTAView.tsx` has a `blockedOnPlatformStack` branch that disables
the **whole VTA Only mode** when no platform stack exists. That becomes wrong:
a farm with no platform stack can still create a VTA Only agent against a
customer stack. The block moves down one level, onto the option:

```text
Connect to:  [ Platform stack ]  ← disabled, carrying the existing reason text
             [ Customize      ]  ← selectable, and auto-selected
```

When `available === false` but `custom_target_allowed === true`, **Customize is
preselected** — the user's only working path should not also be the one they
have to find. When `custom_target_allowed === false` (capacity exhausted) the
whole mode is disabled as it is today, because then neither path can succeed.

### 3.2 Parse locally, then verify with the server

Two steps, and **the second is not optional**.

```
paste → parse JSON + check symbol (local, instant)
      → POST /api/v1/setup/connection/validate (API §5.2)
      → ✓ card rendered from the SERVER's response
```

| State | Render |
| --- | --- |
| not JSON, or `kind` ≠ `vtafarm.stack-connection` | ✗ *"That doesn't look like a connection bundle. Ask for the text from the stack's Share panel."* |
| parses, but the code fails its check symbol (API §4.1.1) | ✗ *"The share code looks mistyped — check it against what you were sent."* |
| validating | spinner; create stays disabled |
| validate passed | ✓ card — stack name, mediator DID, DID host, `2 of 10 agents connected` — **all from the response**; create enables |
| validate failed | the `reason` mapped to a sentence — §3.3 |

**Never render the ✓ card from the pasted JSON.** It would be trivial to — every
field is right there — and it would be a lie: the card would show a confident
"connecting to **alice**" for a bundle whose code is pure garbage, and the user
would find out only after naming their agent, choosing an image and pressing
Create. The card's whole job is to be true at the moment it is shown, so its
values come from the server or it does not appear.

Two consequences to hold onto:

- Create still fails sometimes, and that is correct (API §5.2). A stack can stop
  running or rotate its code between validate and create. Keep the §3.3 mapping
  wired to the create response as well, not only to validate.
- The **share code is never echoed** anywhere on this screen — not in the card,
  not in an error. It is a credential sitting in a textarea on a screen someone
  may be sharing.

The confirmation card matters more than it looks. The user is about to make
their agent depend on somebody else's infrastructure; the last thing they see
before committing should be **whose**, and it should be verified.

### 3.3 Failure reasons, in words

The API returns machine reasons (API §5.1). Map every one — a bare
"422 Unprocessable Entity" under a paste field is useless:

| Reason | Sentence |
| --- | --- |
| `bad_bundle` | That doesn't look like a connection bundle. Ask for the text from the stack's Share panel. |
| `wrong_farm` | This bundle is for a different VTA Farm. You can only connect to stacks running here. |
| `invalid_bundle` | This bundle doesn't open anything here. It may have been deleted, or its owner may have turned sharing off or issued a new code — ask them for a current one. |
| `stack_not_running` | That stack isn't running right now. Ask its owner to check it, then try again. |
| `stack_changed` | This bundle is out of date — the stack has changed since it was copied. Ask for a fresh one. |
| `stack_at_connection_limit` | That stack has reached its limit of connected agents. Ask an admin to raise the limit, or use a different stack. |
| `vta_name_taken` | That name is already taken. Names are unique across the whole farm, not just your account or your stack. |

Three notes on the wording.

`invalid_bundle` covers five different server-side situations on purpose
(API §5.1 tier 1) and the copy must not try to narrow them. Guessing —
*"that stack may not exist"* — would both mislead and undo the reason the API
collapses them: anything more specific turns this field into a way to discover
which stacks exist and which are shared.

It is also the reason the check-symbol test in §3.2 is worth having. Without it,
a single mistyped character lands here, in the vaguest message on the page.

The last row is the message fix API §9.6 calls for: the collision may be with a
session on a stack the user has never heard of, and the old wording implies
otherwise.

---

## 4. The agent's own page

`SessionDetailView.tsx`, for `vta_only`. Today it shows the mediator DID as a
bare string. Once a session can be attached to different stacks it has to say
which — that is the first question when the agent misbehaves.

```text
Connected to     alice · firstperson.dev
                 mediator  did:webvh:…
                 DID host  dids-alice.firstperson.dev
```

From `connection_source` (API §6):

| Value | Label |
| --- | --- |
| `platform` | *Platform stack* — the default; no owner named |
| `in_farm` | the provider's name; or the §4.1 warning when the provider is gone |

### 4.1 The orphaned state, and why the badge still says `running`

There is no `disconnected` status and no change to `STATUS_META` or the
`SetupStatus` union (API §6.4). The agent **is** running — its pod, Service and
Ingress were never touched — so the badge is accurate and the warning belongs in
the "Connected to" block instead:

```text
Connected to     ⚠ this stack no longer exists
                 mediator  did:webvh:…            (unreachable)
                 DID host  dids-alice.…           (unreachable)
```

The condition comes from the API's own fields, not from a status:
`connection_source === 'in_farm'` and no provider named (API §6.1 — Postgres
nulls the link when the provider row goes, so this is durable and needs no
event).

Do **not** show a green `running` badge with no explanation anywhere on the
page — that is the failure this block exists to prevent. The Agents list should
carry a small marker on affected rows so the warning is reachable without
opening each one.

### 4.2 No Move button

When the provider is gone, the copy is:

> The stack this agent connected to no longer exists. The agent is still
> running, but it can't resolve its DID or deliver messages. Create a new agent
> against a stack that's running, then delete this one.

Not "reconnect", not "move". The agent's `did:webvh` contains its host, so
relocating it would mint a different identity — it is not a migration and the UI
must not imply one exists (API §11.3).

---

## 5. Copy for the Share panel

Draft strings, to keep tone consistent with the rest of the portal:

> **Share this stack**
> Anyone you send the bundle to can point a VTA Only agent at this stack's
> mediator and DID hosting. They paste it when they create their agent.
>
> **Before you share:** connected agents store their DIDs on your DID host and
> route their messages through your mediator. Once someone is connected you
> can't remove them individually — you can stop new ones with a new code, or
> delete the stack, which stops everyone.

That second paragraph is the honest version of API §9.2 and §7.4. The costs of
hosting someone else's agent — storage, message volume, and the fact that the
only way out is all-or-nothing — are real and unmetered, and the person taking
them on should read about them before flipping the switch, not after.

---

## 6. Admin surfaces

| Screen | Change |
| --- | --- |
| `SessionsView.tsx` | a provider column — `Platform`, a stack name, `⚠ gone` for an orphan, or `—` for `full_stack` rows |
| `SessionsView.tsx` delete | the same §2.4 warning block. No force option and no 409 to handle — the admin and user delete paths are identical here (API §7.2) |
| `PlatformStackView.tsx` | no Share panel. The platform stack has no share code and needs none — it is reached by the default path (API §4.1) |

The platform stack's page keeping its existing `provides` block is enough; that
block already shows the same three values for operators who want them.

---

## 7. Deliberately not built

- **A stack directory.** No browsing, no search, no list of stacks accepting
  connections. Sharing happens out of band between people who already know each
  other; the share code exists precisely so somebody has to choose you
  (API §11.2).
- **A share link** (`?connection=<base64>`). Removes a paste step, puts a
  credential in browser history, referrers and chat previews.
- **Editing the connection after create.** The three values are snapshotted onto
  the session at create time and a `did:webvh` bakes its host in at mint time.
  An editable field would imply a migration that cannot happen.
- **Disconnecting one agent.** There is no API for it (API §7.4). Do not add a
  button that "removes" a row from the connected list — the connection is a fact
  about the consumer's session, not a row the provider owns.
- **Reconnecting an orphan.** See §4.2.

---

## 8. Design tokens

Nothing new. The Share panel reuses the `AdminKeysCard` / `Row` / `CopyIcon`
shapes from `FullStackOutputs.tsx`; the segmented control reuses `p-tab` from
the mode switcher already in `CreateVTAView.tsx`; the paste textarea reuses the
admin-DID input styling from stage 2; the delete confirm extends the existing
destructive dialog in `sessionActions.ts` rather than replacing it. Consult
`claude-design/Portal.html` before adding anything genuinely new.

---

## 9. Files

| File | Change |
| --- | --- |
| `src/lib/api.ts` | `StackConnection` type; `connection` on the create body; `connection` + `connections[]` on the session type; `connection_source` + provider name; `custom_target_allowed`; `setSharing()` (enable / disable / rotate — one route); `validateConnection()` |
| `src/pages/portal/FullStackOutputs.tsx` | the Share panel — §2 |
| `src/pages/portal/CreateVTAView.tsx` | Platform/Customize control, paste + parse, reason mapping, availability split — §3 |
| `src/pages/portal/SessionDetailView.tsx` | "Connected to" block, orphan warning — §4 |
| `src/pages/portal/portalUtils.tsx` | bundle parse helper + Crockford check-symbol verify (API §4.1.1), shared by create and share |
| `src/pages/portal/AgentsView.tsx` | orphan marker on affected rows — §4.1 |
| `src/pages/portal/sessionActions.ts` | the connected-agents block in the delete confirm — §2.4 |
| `src/pages/admin/SessionsView.tsx` | provider column; same delete confirm — §6 |

`STATUS_META` and the `SetupStatus` union are untouched (§4.1).

---

## 10. What has shipped

Nothing yet.

| Item | Status |
| --- | --- |
| API types + `setSharing()` + `validateConnection()` | ☐ |
| Share panel: switch, rotate, bundle (§2.1–2.2) | ☐ |
| Connected agents, read-only (§2.3) | ☐ |
| Connected-agents block in the delete confirm (§2.4) | ☐ |
| Platform/Customize control + paste/parse (§3) | ☐ |
| Check-symbol test + server-verified ✓ card (§3.2) | ☐ |
| Availability split + Customize preselect (§3.1) | ☐ |
| Reason → sentence mapping (§3.3) | ☐ |
| "Connected to" block + orphan warning (§4, §4.1) | ☐ |
| Admin surfaces (§6) | ☐ |

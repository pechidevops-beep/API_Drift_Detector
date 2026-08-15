# Design System — API Contract Drift Detector

## Design Thesis
The subject is drift: two versions of the same contract, slowly pulling apart, some of
that separation harmless and some of it fracturing whatever depends on it. The whole
visual system is built around that idea — not a generic SaaS dashboard with cards
bolted on. Every screen should read as "a fault line being measured," not "a form with
a diff attached."

This is a tool for backend engineers and tech leads about to ship something. It needs
to feel precise and load-bearing, the way a seismograph or a flight instrument does —
not decorative. Premium here means *restrained and exact*, not maximal.

---

## 1. Token System

### Color
Two separate palettes that never bleed into each other: a **structural palette** (UI
chrome — backgrounds, text, borders) and a **semantic palette** (breaking/warning/safe
— reserved exclusively for change classification, never used decoratively elsewhere).
Mixing these is the single most common way a tool like this becomes confusing to read
at a glance.

| Role | Value | Use |
|---|---|---|
| `--surface-base` | `#0E0F13` | App background — near-black with a cool undertone, not pure black |
| `--surface-raised` | `#16181F` | Panels, the diff container itself |
| `--surface-overlay` | `#1E212B` | Cards, hover states — one step up in elevation |
| `--border-hairline` | `#2A2D38` | Structural dividers, 1px only |
| `--text-primary` | `#EDEEF2` | Primary reading text |
| `--text-secondary` | `#8A8D9B` | Labels, metadata, timestamps |
| `--accent-signal` | `#6E6BFF` | Brand accent — interactive elements, links, focus rings. Electric indigo, deliberately cool and synthetic, evoking a signal trace rather than a corporate blue |
| `--breaking` | `#FF5C5C` | Breaking changes only |
| `--warning` | `#F5A623` | Warning-tier changes only |
| `--safe` | `#3DD9A0` | Non-breaking changes only |

The semantic three (`breaking` / `warning` / `safe`) are the only saturated colors in
the entire system. Everything else is desaturated near-neutrals. This is deliberate:
when a user's eye catches color anywhere in the UI, it should always mean "this is a
classification," never "this is decoration." That discipline is what makes the tool
feel trustworthy rather than noisy.

### Typography
Three roles, each doing one job:

- **Display** — `Söhne` or `General Sans` (geometric, slightly technical, not a default
  system sans). Used only for page titles and the empty-state headline. Set large,
  tight tracking, medium weight — confident, not shouty.
- **Body/UI** — `Inter`. Everything else: labels, buttons, descriptions, the migration
  guide prose. Unremarkable on purpose — it should disappear so the data reads clearly.
- **Data/Structural** — `JetBrains Mono`. This is the signature typographic choice:
  every endpoint path, field name, version label, and diff line uses the mono face at
  real size (not shrunk into a caption). The mono face is treated as a first-class
  citizen of the UI, not just a code-block afterthought — it's what makes the whole
  interface feel like an instrument reading real structural data, not a marketing page
  that happens to show some JSON.

### Elevation (the "layers" system)
Depth is communicated through **exactly three flat surface levels plus one accent
glow** — no soft drop-shadows, no glassmorphism blur-everywhere. Each surface level is
a solid, slightly lighter fill (see `--surface-*` above); the only shadow in the whole
system is a tight, low-opacity contact shadow (`0 1px 2px rgba(0,0,0,0.4)`) under
raised panels, enough to read as "above" without looking like a UI kit demo. The one
place true glow appears is around active/focused elements, using `--accent-signal` at
low opacity — a signal being highlighted, not a light source.

### Spacing & Radius
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 — strict multiples, no arbitrary values
- Radius: `6px` on cards and inputs, `2px` on badges/pills, `0px` on the diff panel
  itself (a diff should feel like raw data, not a rounded card — the one place in the
  system that intentionally breaks the soft-corner convention)

---

## 2. Layout Concept

### The Fault Line (signature element)
Between the "before" and "after" spec panels on the diff screen runs a thin horizontal
seismic trace — a waveform line, flat where nothing changed, spiking in height and
color at each point of drift. Breaking changes spike tall and red. Warnings spike
medium and amber. Non-breaking changes barely register — a small green tick. This
single element does three jobs at once: it's the visual signature of the product, it
gives an instant at-a-glance severity reading before anyone reads a single change
card, and it turns the abstract idea of "API drift" into something you can literally
see the shape of.

```
┌─────────────────────────────┬─────────────────────────────┐
│  v1.0                       │  v2.0                       │
│  ────────────────────       │  ────────────────────       │
│  GET /users/{id}             │  GET /users/{id}             │
│  ...                         │  ...                         │
├───────────╲___╱╲╲___________┼───────────╲___╱╲╲___────────┤
│         (flat)  ╱╲‾‾╲        FAULT LINE   tall=breaking     │
│                 tick  spike                med=warning      │
└─────────────────────────────┴─────────────────────────────┘
```

### Screen Layouts

**Upload**
Two panels side by side, divided by a faint vertical hairline — not two separate
"cards" with padding and shadows competing for attention, just one continuous surface
split by a rule. Drop zone text uses the mono face ("drop spec-v1.yaml"), reinforcing
that this is a data instrument, not a friendly onboarding wizard.

**Diff Result**
Top to bottom: title in Display face → the fault-line trace, full width, sitting
directly under the title as the primary read → Monaco diff below it → change list as
a single column of compact rows (not padded cards — thin dividers between rows,
mono-face paths, semantic-colored left border 3px wide per row instead of colored
backgrounds, which keeps the dark surface calm while still being unambiguous).

**Migration Guide**
Rendered as a single continuous document, not chat bubbles or boxed cards — each
breaking change gets a small mono-face heading (the field path) followed by prose and
a code diff. Reads like an incident postmortem, not a chatbot reply.

**Timeline**
A single vertical line (visually related to the fault-line motif) with diff entries
as ticks along it, spaced proportionally by actual time elapsed — not evenly spaced
list items. A cluster of ticks close together visually tells you "this API was
unstable during this period" before you read a single date.

---

## 3. Motion System

Motion here is not decoration — it's how the tool communicates *magnitude*. A field
being marked optional and a required field being deleted are both "changes," but they
should not feel the same when they animate onto the screen. Motion is one more channel
for encoding severity, same as color.

### Physics, not easing curves
Use spring-based motion (mass/stiffness/damping) instead of fixed-duration
`ease-in-out` curves wherever something responds to a direct user action (hover,
click, drag). Springs settle naturally and feel physically real; fixed easing curves
on interactive elements read as slightly synthetic, especially at the small scale of
buttons and badges. Reserve simple duration/easing curves for purely presentational
motion the user isn't directly driving (e.g. a staggered list reveal on page load).

Suggested defaults:
- Interactive (buttons, toggles, drag): spring, stiffness ~380, damping ~28 — fast, a
  little bouncy, confirms the click landed
- Panel/page transitions: spring, stiffness ~210, damping ~26 — slower, no overshoot,
  feels deliberate rather than playful
- Ambient/ammbient reveals (fault-line drawing in, cards staggering on load): duration-based, 400–600ms, `cubic-bezier(0.16, 1, 0.3, 1)` (a fast-out, gentle-settle curve)

### Duration scales with distance and consequence, not a fixed number
Don't use one duration everywhere. A badge fading in place is fast (120–160ms). A
panel sliding into view is slower (280–400ms). The fault-line drawing itself, since
it's the hero moment, gets the most time (600–900ms) — but breaking-change spikes
should draw in with a sharper acceleration than the flat sections, so the eye is
pulled toward severity as it renders, not treated uniformly.

### Orchestration over scattered effects
On the diff screen's load:
1. Panels fade/slide in first (the containers)
2. The fault line draws left-to-right, like a needle tracing (not all at once)
3. Change-list rows stagger in *in severity order* — breaking first, then warning,
   then safe — reinforcing what matters most before the eye even reads text

This is one orchestrated sequence, not five independent animations firing at once.
Everything else in the UI (hover states, focus rings, button presses) stays quick and
minimal — the loud moment is spent once, at load, on the thing that matters.

### Micro-interactions, specifically
- Buttons: scale to 0.97 on press (spring), back to 1 on release — never a color-only
  press state, always a physical compression
- Change-list rows: on hover, the semantic-colored left border brightens and the row
  shifts 2px right — small enough to feel responsive, not enough to feel gimmicky
- Copy-to-clipboard (migration guide): icon morphs to a checkmark via a quick spring
  scale + fade, reverts after ~1.5s — confirms the action without a toast interrupting
  the reading flow
- Filter tabs (All/Breaking/Warning/Safe): the active-tab underline slides between
  positions rather than snapping, using the spring physics tab described above

### Respect constraints
- Full `prefers-reduced-motion` support — all spring/duration animations collapse to
  instant or a 100ms opacity crossfade only
- Nothing animates on scroll for its own sake — no parallax, no fade-up-on-scroll for
  every section. This tool is read top-to-bottom quickly by someone under deadline
  pressure; scroll-triggered decoration would work against that

---

## 4. Restraint Checklist (self-critique before shipping any screen)
- Does every use of `--breaking` / `--warning` / `--safe` correspond to an actual
  classification, never decoration? If any other element in the UI uses these colors,
  remove it.
- Is the fault-line the one "loud" moment on the diff screen, with everything else
  quiet around it? If two elements are competing for attention, cut one.
- Would this screen still be legible with all animation removed? Motion should
  clarify, not carry meaning that's otherwise absent.
- Is the mono face doing real structural work (paths, versions, field names), not
  just applied for aesthetic texture?
- Test at actual mobile width and with keyboard-only navigation before calling any
  screen done — visible focus rings using `--accent-signal`, no motion-only affordances.

 -One thing to verify yourself, not take my word for: the font names I used (Söhne, General Sans, JetBrains Mono) — confirm licensing/availability before Antigravity wires them in. Söhne is commercial-license-only; you may want General Sans (free, similar geometric feel) as the display face instead to avoid a licensing snag mid-build.


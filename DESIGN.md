# SnapVibe — Design System

A playful, cute web photobooth. The visual world is Indonesian **`cetak layar`**
(screenprint): a cream paper sheet, a handful of saturated spot inks, hand-placed
overlaps, and hard offset shadows. Nothing is soft or corporate, but nothing is
chaotic either — every surface is built from the same small set of parts.

The single source of truth is `src/app/globals.css`. Tokens are exported through
Tailwind v4's `@theme`, so every value below is usable directly as a utility
(`bg-pink`, `rounded-[var(--radius)]`, `shadow-lift-2`, `font-display`).

---

## 1. Colour

### Paper (surfaces)

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#fdf3e3` | Page ground — cream paper, never neutral grey |
| `--bg-elev` | `#fffdf8` | Raised cards, inputs |
| `--bg-sunken` | `#f7e7cd` | Recessed areas, hover on light surfaces |

### Ink (text)

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#241428` | Headings, strong text — deep warm plum, not black |
| `--ink-body` | `#52405a` | Body copy |
| `--ink-meta` | `#7d6a86` | Labels, captions |

### Spot inks

Five saturated colours, used as large fills rather than accents sprinkled around.

| Token | Value | Role |
| --- | --- | --- |
| `--pink` | `#ff3d8b` | Primary action |
| `--orange` | `#ff7a1a` | Secondary action, hover states |
| `--butter` | `#ffd23f` | Highlight surface, admin login panel |
| `--mint` | `#3dd9a0` | Success, "go" actions |
| `--sky` | `#3da5f5` | Informational surface, input focus |
| `--plum` | `#7b2d8e` | Dark chip, locked/locked-out state |

### Mixing table

Where two inks overlap, the overlap becomes the new colour. This is how the
screenprint metaphor stays literal instead of decorative.

| Token | Value |
| --- | --- |
| `--mix-coral` | `#ff5f5f` |
| `--mix-plum` | `#a63a9a` |

`--accent` is an alias of `--pink` kept for the pre-existing utility names
(`text-accent`, `bg-accent`).

### Dark mode

Dark mode is the "night event" scenario: cream inks on deep mulberry, so the
candy palette still reads instead of muddying. Spot inks are lightened, not
desaturated. Triggered by `prefers-color-scheme: dark` unless
`data-theme="light"` is set explicitly.

---

## 2. Shape and elevation

### Radius — rounded everywhere

The old radius-0 lock is gone. It fought the chosen aesthetic.

| Token | Value | Use |
| --- | --- | --- |
| `--radius-sm` | `8px` | Tight insets |
| `--radius` | `16px` | Default: buttons, inputs, chips |
| `--radius-lg` | `26px` | Cards |
| `--radius-xl` | `34px` | Hero panels, login card |
| `--radius-pill` | `999px` | Status pills, tags |

### Sticker elevation

Hard offset shadows with **zero blur** — the way a cut sticker sits on paper.
Never a soft glow.

| Token | Value | Use |
| --- | --- | --- |
| `--lift-1` | `2px 3px 0 var(--line-strong)` | Cards, inputs |
| `--lift-2` | `4px 6px 0 var(--line-strong)` | Primary buttons, panels |
| `--lift-3` | `6px 9px 0 var(--line-strong)` | Hero-level panels |
| `--lift-ink` | `4px 6px 0 var(--ink)` | On dark surfaces |

Borders are `2px solid var(--ink)` on light surfaces. The 2px ink border plus
the offset shadow is what produces the printed-sticker read; a soft border would
lose it.

---

## 3. Typography

| Role | Family | Notes |
| --- | --- | --- |
| Display | **Baloo 2** (`font-display`) | Headings, wordmark, numbers, buttons, labels |
| Body | **Nunito** (`font-sans`) | Paragraphs, inputs, links |

Display type is set large and extrabold (`font-extrabold`); body copy stays
`font-semibold` so it holds up on a phone in daylight.

Type scale, spacing, and the `--measure` / `--shell` layout constants are defined
at the top of `globals.css`.

---

## 4. Layout

| Token | Value |
| --- | --- |
| `--shell` | `1240px` |
| `--measure` | `66ch` |
| `--gutter` | `clamp(1.25rem, 4vw, 2.5rem)` |
| `--section` | `clamp(4rem, 7.5vw, 7rem)` |

`.shell` is the horizontal container (centred, max-width, gutter). Long-form
pages (privacy, event) cap content at `--measure`.

---

## 5. Motion

Motion is CSS-only. No animation library — the app must stay fast on phones.

| Token | Value | Use |
| --- | --- | --- |
| `--ease` | `cubic-bezier(0.2, 0.9, 0.25, 1)` | Hover / press transitions |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances, one-shot reveals |
| `--dur-fast` | `0.16s` | Press and hover |
| `--dur` | `0.42s` | Entrance reveals |

**No bounce or elastic easing.** Real objects decelerate smoothly; an overshoot
curve on everything reads as tacky. Where a playful "pop" is wanted (the
countdown), the overshoot is authored into the keyframe scale values instead of
the timing function.

All motion is disabled under `prefers-reduced-motion: reduce`.

---

## 6. Components (CSS utilities)

| Utility | What it does |
| --- | --- |
| `label` | Small uppercase display label in `--ink-meta` |
| `shell` | Centred page container with gutter |
| `pressable` | Sticker press: lifts on hover, sinks on active |
| `misregister` | Slight off-register cyan text-shadow on the wordmark |
| `ink-underline` | 3px butter underline |
| `reg-cross` | Registration-cross mark — this world's drawn icon |
| `ink-splat-in` | Entrance reveal for section content |
| `pop-count` | Countdown number pop (scale 1.35 → 0.94 → 1) |

---

## 7. Iconography

Tabler icons only, at `stroke={2.5}` to match the chunky ink weight. **No emoji
and no Unicode pictographs anywhere in the UI** — the registration cross
(`reg-cross`) is the one hand-drawn mark, and it is CSS.

---

## 8. Voice

Indonesian, casual and short. "Nggak perlu install", "Nggak ada antre". Confident
and friendly, never corporate or salesy. The app is public and self-serve, so
copy explains the next action directly rather than describing features.

---

## 9. Rules

- Rounded corners, always. No `radius: 0`.
- Hard offset shadows, never blurred glows.
- Candy inks on cream paper. Do not introduce greys or muted pastels.
- Ink borders, not hairline grey rules.
- `pressable` on anything clickable that looks like a sticker.
- No emoji as icons. No new animation libraries.
- Check contrast in both light and dark mode before shipping a new colour.

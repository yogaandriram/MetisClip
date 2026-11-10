---
name: metisclip-soft-organic
description: Light, soft-organic desktop UI. Off-white canvas, ink-black structure, the owner's four greens as accents, pill controls, rounded cards and a few liquid shapes.
---

# MetisClip Design System

> The source of truth for the desktop app's UI: tokens, shapes, components, screens and rules.
> **Revised 2026-11-10.** This replaces the dark glassmorphism system (Liquid Blue `#1856FF`, deep-space backgrounds, frosted panels). That system is obsolete. Migrate screens as you touch them (§13).
>
> **Inputs:**
> - Style reference: the "Project Management Tool design" dashboard shot the owner supplied on 2026-11-10.
> - Palette chosen by the owner: `#ECFAE5`, `#DDF6D2`, `#CAE8BD`, `#B0DB9C`.
>
> **Scope:** app chrome only. Subtitle presets, Brand Template output and rendered video are content. They keep their own colors and fonts (§1.4).

---

## 1. Direction

### 1.1 What the reference does

The reference is a light dashboard that feels soft and hand-made rather than corporate. It does this with very few colors and a strong shape language. These are the traits MetisClip takes from it:

| Trait | In the reference | In MetisClip |
|---|---|---|
| **Neutral, airy base** | Off-white canvas, pure white cards, no borders, almost no shadows | `--canvas` + `--surface`; cards separate by tone, not lines |
| **Ink as structure** | A black nav rail, black chart cells, black tooltips and icon tiles | `--ink` for the rail, primary buttons, the video stage, chart marks and tooltips |
| **Pastel accent family** | Lime and peach as card fills and layered blobs | The owner's four greens (§2.1). The reference's orange is not carried over; its role goes to ink and leaf |
| **Pills for anything you act on** | Nav pill group, search pill, time pill, chip pairs, progress rows | Buttons, inputs, chips, badges, segmented controls and the rail are all `--r-full` |
| **Large-radius containers** | Cards around 28–32 px | `--r-lg` 28 px cards, `--r-xl` 36 px modals and stage |
| **Liquid nav indicator** | The active item is a white circle that bites into the black rail with smooth S-curves | The rail bite (§4.2.1), MetisClip's signature element |
| **Notched corner badges** | Icon circles sitting in a cut-out at a card's corner | The notch badge (§4.2.2) |
| **Layered corner blobs** | Three nested organic shapes in one corner of a card | The corner blob (§4.2.3), used sparingly |
| **Topographic lines** | Contour texture on the solid "Go premium" card | Contour lines on the ink hero card (§4.2.4) |
| **Metaball bridges** | "new" and "opportunities" chips joined by a liquid neck | The goo bridge (§4.2.5) |
| **Tilted widget with dashed ghost** | A card rotated a few degrees over its dashed "home" outline | One tilted stat card per overview screen at most (§4.2.6) |
| **Dashed outline = add something here** | "Add new widgets" placeholder with a lime + button | Create-cards and the video drop zone (§4.2.7) |
| **Stacked-cell bars** | Each bar is a column of outlined rounded cells, with the top cell filled black and labelled | Small integer counts per day (§9) |
| **Geometric type, medium weights** | Rounded geometric sans, headings at medium weight, big numbers at regular weight | Outfit for display and Plus Jakarta Sans for text (§3) |
| **Thin outline icons** | Monochrome, about 1.5–2 px stroke | lucide-react at 1.75 stroke (§7) |

**Not carried over:**

- **Orange.** The second accent family is replaced by ink plus the greens, so the palette stays as the owner chose.
- **The emoji greeting.** UI copy has no emoji.
- **Clock, weather, search and notification bell.** MetisClip has no such features, so the top bar does not fake them.
- **The "Go premium" upsell.** There is no monetization in v1 (CLAUDE.md D1).
- **The floating window frame and the blobs behind it.** That is presentation styling for the shot; MetisClip *is* the window.

### 1.2 Design read

- **Theme:** light only in v1. The reference and the palette are light. Video is watched on the ink stage (§8.17), so editing does not need a dark theme. The tokens are named by role, which leaves room for a dark theme later.
- **Decoration:** *expressive at the edges, quiet at the core.*
  - Overview screens (Beranda, Setup Wizard, empty states) may use blobs, contour lines, the tilt and notches.
  - Work screens (clip editor, Brand Template editor, Pengaturan, Antrian, Sistem, tables) use only flat cards, pills and ink.
- **Density:** medium. This is a desktop tool used for hours: rows of 56 px, 44 px controls, and denser 32–40 px controls inside the editor.
- **Rhythm:** overview screens use a varied bento because their content really differs in size. Work screens use regular columns.
- **Motion:** subtle. State changes only, plus one signature movement: the rail bite glides between items.

### 1.3 Shape tells you the role

This is the rule that keeps a pill-heavy UI readable:

| Shape | Meaning | Examples |
|---|---|---|
| Pill or circle (`--r-full`) | You can act on it, or it labels a state | Buttons, inputs, chips, badges, segmented controls, icon buttons, the rail |
| Rounded rectangle (`--r-sm`…`--r-xl`) | It holds content | Cards, panels, menus, modals, thumbnails, the stage |
| Dashed outline | Something can be added or dropped here | "Buat klip baru" card, video drop zone, empty slots |

### 1.4 Out of scope

- `frontend/lib/presets/*`, `render-engine/` and the subtitle preset defaults: these are video content and never use UI tokens.
- Brand Template values (logo, caption colors, fonts): these are user content shown *inside* the stage.
- The ink stage keeps video previews looking the way they will on a phone, whatever the chrome around them looks like.

---

## 2. Color

### 2.1 Brand palette (owner)

All four greens share hue ≈ 101° and are light. None of them is dark enough for text on a light surface, so they work as **fills** with ink on top.

| Token | Hex | Name | Role |
|---|---|---|---|
| `--mist` | `#ECFAE5` | Mist | Hover fill on white, selected table row, drop-zone drag-over, quiet info panels |
| `--dew` | `#DDF6D2` | Dew | Success and "completed" badges (with moss text), clip tag chips, secondary tinted card, current transcript line |
| `--sage` | `#CAE8BD` | Sage | Middle blob layer, pressed state of dew and mist fills, third chart series |
| `--leaf` | `#B0DB9C` | Leaf | **The accent**: create actions ("+"), the one highlighted card per screen, the active subtitle word, top viral scores, the focus halo, the rail count badge, accents on ink |

### 2.2 Derived tones

These two are computed from the palette's hue. Use them only where the four pastels cannot do the job.

| Token | Hex | Why it exists |
|---|---|---|
| `--leaf-strong` | `#9BCD84` | Hover and pressed state of leaf fills. The palette has nothing darker than leaf. |
| `--moss` | `#345625` | Green **text and icons** on light surfaces: success labels, links inside green panels, the chart line core. It passes AA on white and on every palette green. |

### 2.3 Neutrals

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#121412` | Rail, primary buttons, video stage, tooltips, toasts, chart marks, body text. Slightly green-tinted black. |
| `--ink-soft` | `#2A2E29` | Hover on ink; raised areas inside the stage (timeline track) |
| `--ink-line` | `#3A4038` | Dividers and tracks on ink surfaces |
| `--canvas` | `#F4F6F2` | Window background; sunken areas inside white cards (segmented tracks, table header) |
| `--surface` | `#FFFFFF` | Cards, inputs, popovers, modals |
| `--line` | `#E4E8E1` | Hairline dividers (decorative) |
| `--line-dashed` | `#B8BEB3` | Dashed outlines of create-cards and drop zones |
| `--line-input` | `#858C81` | Borders that identify a control: inputs, secondary buttons, unchecked boxes, chart cells (≥ 3:1) |
| `--skeleton` | `#EDF0EA` | Loading placeholders |

**Text tokens**

| Token | Hex | Use |
|---|---|---|
| `--text` | `#121412` | Default text (same as ink) |
| `--text-muted` | `#5C6358` | Secondary text, subtitles, table headers |
| `--text-subtle` | `#6B7267` | Placeholders and meta text, only on surface, canvas or mist |
| `--text-disabled` | `#A3AA9F` | Disabled labels (exempt from contrast rules) |
| `--on-ink` | `#FFFFFF` | Text and icons on ink |
| `--on-ink-muted` | `#A3AA9F` | Secondary text and inactive rail icons on ink |

### 2.4 Status

Status colors are functional, not brand colors. Use them only to label a state, always together with an icon and a word.

| State | Fill | Text / icon |
|---|---|---|
| Success | `--dew` | `--moss` |
| Warning (`interrupted`, low disk) | `--warning-soft` `#FFF1DB` | `--warning` `#8A5300` |
| Danger (`failed`, destructive) | `--danger-soft` `#FCE8E6` | `--danger` `#B3261E` |
| Running | `--ink` | `--on-ink` + spinner |

### 2.5 Measured contrast (WCAG 2.2)

All values were computed from the hex codes above. ✗ means "do not use this pair for text".

| Foreground | surface | canvas | mist | dew | sage | leaf | ink |
|---|---|---|---|---|---|---|---|
| `--ink` / `--text` | 18.51 | 17.02 | 17.08 | 16.03 | 13.92 | 11.86 | — |
| `--text-muted` | 6.21 | 5.71 | 5.73 | 5.38 | 4.67 | 3.98 ✗ | — |
| `--text-subtle` | 4.97 | 4.57 | 4.58 | 4.30 ✗ | ✗ | ✗ | — |
| `--moss` | 8.39 | 7.71 | 7.74 | 7.26 | 6.31 | 5.38 | — |
| `--danger` | 6.54 | 6.01 | — | — | — | — | — |
| `--warning` | 6.33 | 5.82 | — | — | — | — | — |
| `--on-ink` | — | — | — | — | — | — | 18.51 |
| `--leaf` | 1.56 ✗ | 1.43 ✗ | — | — | — | — | 11.86 |
| `--on-ink-muted` | — | — | — | — | — | — | 7.76 (5.79 on ink-soft) |

Other pairs: danger on danger-soft 5.55, warning on warning-soft 5.68, white on danger 6.54.

**Non-text contrast (3:1, WCAG 1.4.11):**

- `--line-input`: 3.46 on surface, 3.18 on canvas. This is the lightest border allowed to identify a control.
- Leaf against white or canvas: 1.56 or less. **A green fill can never be the only boundary or the only state indicator.** Pair it with ink (text, icon, outline) or with a visible label.
- Ink against any light token: ≥ 11.8, so ink is the default for state (selected segment, checked box, toggle on).

### 2.6 Usage rules

- **Proportion per screen:** about 60 % neutrals (canvas and surface), about 25 % ink, about 10 % greens, at most 5 % status colors.
- **One leaf moment per region.** Leaf marks the thing to look at or the way to start something new. If leaf is everywhere, it stops being the accent.
- **Text on greens is always `--ink`**, or `--moss` for success labels. Never put `--text-muted` on leaf, and never use any palette green as a text color on a light surface.
- **On leaf cards, every piece of text is ink.** Secondary text uses ink at weight 400 rather than a gray.
- **No gradients** in chrome. The only layered color is the chart line (§9) and the blob layers (§4.2.3).
- **No raw hex or rgba outside the token block** in `globals.css`. SVG decorations reference tokens through `var()`.

### 2.7 Token block

This replaces the `:root` block in `frontend/styles/globals.css`.

```css
:root {
  color-scheme: light;

  /* Brand greens (owner palette) */
  --mist: #ECFAE5;
  --dew: #DDF6D2;
  --sage: #CAE8BD;
  --leaf: #B0DB9C;

  /* Derived from the palette (hue 101°): states and text only */
  --leaf-strong: #9BCD84;
  --moss: #345625;

  /* Neutrals */
  --ink: #121412;
  --ink-soft: #2A2E29;
  --ink-line: #3A4038;
  --canvas: #F4F6F2;
  --surface: #FFFFFF;
  --line: #E4E8E1;
  --line-dashed: #B8BEB3;
  --line-input: #858C81;
  --skeleton: #EDF0EA;

  /* Text */
  --text: #121412;
  --text-muted: #5C6358;
  --text-subtle: #6B7267;
  --text-disabled: #A3AA9F;
  --on-ink: #FFFFFF;
  --on-ink-muted: #A3AA9F;

  /* Status */
  --success: var(--moss);
  --success-soft: var(--dew);
  --warning: #8A5300;
  --warning-soft: #FFF1DB;
  --danger: #B3261E;
  --danger-soft: #FCE8E6;

  /* Type */
  --font-display: 'Outfit', 'Plus Jakarta Sans', sans-serif;
  --font-text: 'Plus Jakarta Sans', 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', Consolas, monospace;

  /* Shape */
  --r-xs: 8px;
  --r-sm: 12px;
  --r-md: 20px;
  --r-lg: 28px;
  --r-xl: 36px;
  --r-full: 999px;

  /* Space */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px; --s-5: 20px;
  --s-6: 24px; --s-8: 32px; --s-10: 40px; --s-12: 48px; --s-16: 64px;

  /* Elevation */
  --shadow-1: 0 12px 32px -8px rgb(18 20 18 / 0.18);
  --shadow-2: 0 32px 80px -16px rgb(18 20 18 / 0.32);
  --scrim: rgb(18 20 18 / 0.40);

  /* Motion */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 320ms;
}

body {
  background: var(--canvas);
  color: var(--text);
  font: 400 14px/20px var(--font-text);
  -webkit-font-smoothing: antialiased;
}

::selection { background: var(--leaf); color: var(--ink); }
```

---

## 3. Typography

### 3.1 Families

| Role | Family | Why |
|---|---|---|
| Display: page titles, card titles, big numbers, chart labels | **Outfit** (`@fontsource/outfit`, already bundled) | A geometric, rounded sans. In a side-by-side specimen it came closest to the reference's letterforms, ahead of Plus Jakarta Sans and Poppins. |
| Text: body, labels, buttons, inputs, tables | **Plus Jakarta Sans** (already the app font) | Stays legible at 12–14 px, which Outfit does less well. It suits Indonesian copy and is designed in Indonesia. |
| Data: timecodes, durations, file sizes, versions, logs | **JetBrains Mono** | Tabular digits, so values that change (progress, timecodes) do not jitter. |

All three load offline through `frontend/styles/fonts.ts`. Do not add a fourth family to the chrome.

### 3.2 Scale

| Token | Family | Weight | Size / line | Tracking | Use |
|---|---|---|---|---|---|
| `display` | Outfit | 400 | 40 / 44 | −0.02em | Big numbers in stat cards |
| `h1` | Outfit | 500 | 30 / 36 | −0.01em | Page title, Beranda greeting |
| `h2` | Outfit | 500 | 22 / 28 | −0.005em | Card and modal titles |
| `h3` | Outfit | 500 | 18 / 24 | 0 | Section titles inside cards |
| `body-lg` | Jakarta | 400 | 16 / 24 | 0 | Page subtitle, wizard copy |
| `body` | Jakarta | 400 | 14 / 20 | 0 | Default |
| `label` | Jakarta | 600 | 14 / 20 | 0 | Buttons, field labels, primary table cell |
| `caption` | Jakarta | 500 | 12 / 16 | 0.01em | Table headers, meta, chips, badges, tooltips |
| `mono` | JetBrains Mono | 500 | 13 / 16 | 0 | Timecodes, durations, sizes (`font-variant-numeric: tabular-nums`) |

### 3.3 Rules

- **Weights:** Outfit 400 or 500 (600 only for a single emphasized number); Jakarta 400, 500 or 600. No 700–900 in the chrome. The reference gets its softness from medium weights.
- **Sizes:** Outfit is used at 15 px or larger only (stacked-cell labels are the smallest). No UI text below 12 px.
- **Case:** sentence case everywhere ("Hasil Clip", "Mulai proses"). No uppercase labels with wide letter-spacing.
- **Numbers with units:** "12 klip", "64%", "18,4 GB" (Indonesian decimal comma). Units stay in the same type token as the number.

---

## 4. Shape

### 4.1 Radius scale

| Token | Value | Use |
|---|---|---|
| `--r-xs` | 8 px | Checkboxes, keyboard hints, tiny thumbnails in table rows |
| `--r-sm` | 12 px | Chart cells, tooltips, menu items, icon tiles, timeline track |
| `--r-md` | 20 px | Popovers, dropdowns, textareas, inner panels, clip thumbnails |
| `--r-lg` | 28 px | Cards |
| `--r-xl` | 36 px | Modals, the Setup Wizard card, the video stage |
| `--r-full` | 999 px | Every control (§1.3) |

**Nested radius:** inner radius = outer radius − padding, with a minimum of 12 px. A 28 px card with 16 px padding holds 12 px elements.

### 4.2 Organic motifs

These give MetisClip its character. Each has a **dose cap**; going over it turns character into noise.

| Motif | Where it is allowed | Cap per screen |
|---|---|---|
| Rail bite | Nav rail only | 1 (always present) |
| Notch badge | Stat cards, hero card, preset cards | 4 |
| Corner blob | White or mist cards on overview screens, Setup Wizard, empty states | 2 |
| Contour lines | Ink hero card | 1 |
| Goo bridge | Two pills of the **same fill** forming one compound label | 1 per card |
| Tilt + dashed ghost | One stat card holding just a number and a label, on an overview screen | 1 |
| Dashed outline | Create-cards, drop zones, empty slots | no cap (it has a meaning) |

None of them are used in the clip editor, the Brand Template editor, Pengaturan or tables.

#### 4.2.1 Rail bite

The active nav item is a white circle that bites into the ink rail from the canvas side, connected with concave curves. It is one SVG that moves along the rail. The bite path must be filled with the color **behind** the rail (`--canvas`).

```html
<nav class="rail" aria-label="Navigasi utama" style="--bite-y: 94px">
  <svg class="rail-bite" viewBox="0 -56 66 112" aria-hidden="true">
    <path d="M66 56H64C64 34 50 26 36 26A26 26 0 0 1 36 -26C50 -26 64 -34 64 -56H66Z" />
    <circle cx="36" cy="0" r="22" />
  </svg>
  <a class="rail-item" href="/dashboard/" aria-label="Beranda" aria-current="page">…</a>
  …
</nav>
```

```css
.rail {
  position: relative;
  width: 64px;
  padding: 20px 0;
  border-radius: var(--r-full);
  background: var(--ink);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.rail-bite {
  position: absolute;
  top: -56px;                                  /* center of the SVG sits on the rail's top edge… */
  left: 0;
  width: 66px;
  height: 112px;
  transform: translateY(var(--bite-y));        /* …then moves to the active item's center */
  transition: transform var(--dur-slow) var(--ease-spring);
  pointer-events: none;
}
.rail-bite path { fill: var(--canvas); }
.rail-bite circle { fill: var(--surface); }
.rail-item {
  position: relative;
  z-index: 1;
  width: 44px;
  height: 44px;
  border-radius: var(--r-full);
  display: grid;
  place-items: center;
  color: var(--on-ink-muted);
  transition: color var(--dur-fast) var(--ease-out);
}
.rail-item:hover { color: var(--on-ink); }
.rail-item[aria-current='page'] { color: var(--ink); transform: translateX(4px); } /* centers the icon in the bite */
```

`--bite-y` is the active item's `offsetTop + 22` (its vertical center), set from React when the route changes.

#### 4.2.2 Notch badge

An icon circle sits over a card's corner. A ring in the color behind the card fakes the cut-out.

```css
.notch {
  position: absolute;
  top: -8px;
  left: -8px;
  z-index: 2;
  width: 44px;
  height: 44px;
  border-radius: var(--r-full);
  display: grid;
  place-items: center;
  background: var(--leaf);
  color: var(--ink);
  box-shadow: 0 0 0 6px var(--notch-ring, var(--canvas));
}
.notch--end { left: auto; right: -8px; }       /* top-right, e.g. the hero card's open button */
.notch--ink { background: var(--ink); color: var(--on-ink); }
```

- The card must not use `overflow: hidden`; put decoration in an inner `.card-deco` layer instead (§4.2.3).
- If the badge is a link or button, it gets an `aria-label`. If it only marks the category, it is `aria-hidden`.

#### 4.2.3 Corner blob

Three nested organic shapes anchored to the top-right corner: leaf on the outside, then sage, then dew.

```html
<div class="card-deco" aria-hidden="true">
  <svg class="blob" viewBox="0 0 200 200">
    <path class="blob-1" d="M52 0H200V150C184 166 158 164 144 146C130 128 106 130 90 114C72 96 84 72 72 50C62 32 46 18 52 0Z" />
    <path class="blob-2" d="M88 0H200V112C188 124 168 122 158 108C148 94 128 96 118 82C106 66 116 46 106 30C98 18 84 12 88 0Z" />
    <path class="blob-3" d="M124 0H200V72C192 80 178 80 172 70C166 60 152 60 146 50C138 38 146 24 138 14C134 8 124 6 124 0Z" />
  </svg>
</div>
```

```css
.card-deco { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; pointer-events: none; }
.blob { position: absolute; top: 0; right: 0; width: 60%; }
.blob-1 { fill: var(--leaf); }
.blob-2 { fill: var(--sage); }
.blob-3 { fill: var(--dew); }
```

Text stays in the bottom-left of the card and never sits on the blob.

#### 4.2.4 Contour lines (ink hero card)

```html
<svg class="card-deco contour" viewBox="0 0 300 200" preserveAspectRatio="none" aria-hidden="true">
  <g fill="none" stroke="var(--leaf)" stroke-opacity=".16" stroke-width="1.2">
    <path d="M-20 160C40 120 80 190 140 150S240 90 320 130" />
    <path d="M-20 130C40 90 80 160 140 120S240 60 320 100" />
    <path d="M-20 100C40 60 80 130 140 90S240 30 320 70" />
    <path d="M-20 70C40 30 80 100 140 60S240 0 320 40" />
  </g>
</svg>
```

#### 4.2.5 Goo bridge

A liquid neck joins two pills of the same fill so they read as one compound label, for example "Analisis" + "klip 2 dari 3". Do not use it for segmented controls, where only one option is filled.

```css
.goo-pair { display: inline-flex; align-items: center; }
.goo-pair > .chip,
.goo-pair > .goo { background: var(--goo-fill, var(--surface)); }
.goo {
  position: relative;
  z-index: 1;
  width: 16px;
  height: 32px;                                 /* = chip height */
  margin: 0 -5px;
  mask-image:
    radial-gradient(circle at 50% -3px, transparent 10px, #000 10.5px),
    radial-gradient(circle at 50% calc(100% + 3px), transparent 10px, #000 10.5px);
  mask-composite: intersect;
}
```

#### 4.2.6 Tilt with dashed ghost

```css
.tilt-ghost { border: 1.5px dashed var(--line-dashed); border-radius: var(--r-lg); }
.tilt-ghost > .card { transform: rotate(-4deg); }
```

- The angle is −3° to −5°.
- Only for a card with one number and one label. Never for a card with controls, a list or more than two lines of text.

#### 4.2.7 Dashed outline

`1.5px dashed var(--line-dashed)` with radius `--r-lg`. It always means "add or drop something here" and always contains a real action (§8.15).

---

## 5. Space and layout

### 5.1 Spacing scale

Use the 4 px based tokens `--s-1` through `--s-16` (4, 8, 12, 16, 20, 24, 32, 40, 48, 64).

| Context | Value |
|---|---|
| Card padding | 24 (compact cards and editor panels: 20) |
| Gap between cards (bento and grids) | 20 |
| Gap between page sections | 32 |
| Label to field | 6 |
| Field to field | 16 |
| Window edge to rail, and rail to content | 16 and 24 |

### 5.2 App shell

```
┌ window: --canvas ──────────────────────────────────────────────────────────────┐
│ 16                                                                              │
│ (●) logo 64        h1 Page title                  [ Agent ▾ │ + Klip baru ]  (◌ 2 proses) │
│                    body-lg subtitle                                              │
│ ┌──┐                                                                            │
│ │▦ │    ┌ content: 12 columns, gap 20, max-width 1600 ─────────────────────────┐ │
│ │◖●│    │                                                                      │ │
│ │▤ │    │                                                                      │ │
│ │▣ │    │                                                                      │ │
│ │  │    │                                                                      │ │
│ │(◎)│ Sistem                                                                   │ │
│ └──┘    └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Logo:** a 64 px ink circle, 16 px from the top-left, holding the MetisClip mark in leaf.
- **Rail:** 64 px wide, starts 12 px below the logo and ends 16 px above the window bottom.
  - Main items, from `NAV_ITEMS`: Beranda, Cari Video, Antrian, Hasil Clip, Brand Template, Pengaturan.
  - Bottom slot: **Sistem**, as a white circle button. It shows a danger dot only when the engine or database reports a real problem.
  - Antrian shows a count badge (20 px leaf circle, ink caption) while jobs are active.
  - Each item has an `aria-label` and a tooltip to its right (§8.10).
- **Top bar:** 64 px tall, aligned with the logo, and scrolls with the page (the clip editor is the exception, where it stays fixed).
  - Left: `h1` and one subtitle line.
  - Right: a pill group with the agent switcher (agent name + chevron, opens a popover with the agent list and "Kelola Super Agents") and a soft inner pill "+ Klip baru" (goes to Cari Video).
  - Next to it, a jobs pill ("2 proses berjalan" with a spinner, links to Antrian), shown only while jobs run.
- **Content:** left offset 16 + 64 + 24 = 104 px, right padding 24 px. A 12-column grid with 20 px gaps, max-width 1600 px. On wider windows it is left-aligned, next to the rail.
- **Window:** minimum 1280 × 720 (CLAUDE.md §9.3). At 1280 the content is about 1150 px wide, which fits a 4-column bento (span 3 each) or an 8 + 4 split.

---

## 6. Elevation and surfaces

| Level | What | Treatment |
|---|---|---|
| 0 | Canvas | `--canvas` |
| 1 | Cards | `--surface` or a tint. **No border, no shadow.** |
| 2 | Interactive card on hover, dragged item | `--shadow-1`, `translateY(-2px)` |
| 3 | Popover, dropdown, chart tooltip, toast | `--shadow-1` and `1px solid var(--line)` (toast: ink, no border) |
| 4 | Modal | `--shadow-2` over a `--scrim` backdrop |

- **No glass.** The one exception is the player controls laid over video on the stage: `background: rgb(18 20 18 / .55); backdrop-filter: blur(12px)`, so they stay readable over moving pictures.
- **No glows.** The leaf focus halo on inputs is the only halo.

---

## 7. Iconography

- **Library:** lucide-react. It is already a dependency, ships offline, and its outline style matches the reference's thin monochrome icons.
- **Stroke:** 1.75.
- **Sizes:** 16 px inline with text, 20 px in buttons, inputs and the rail, 24 px in empty states and icon tiles.
- **Color:** icons inherit `currentColor`. They take their color from the container: white on ink, ink on leaf, moss in success contexts. **No green icon strokes on white**, which fails contrast.
- **Meaning first:** no sparkles, magic wands or robots for "AI". Replace `Sparkles` on Cari Video with a content icon such as `Clapperboard`. Every icon-only button has an `aria-label` and a tooltip.

---

## 8. Components

Paths refer to `frontend/components/ui/`.

### 8.1 Button (`Button.tsx`)

| Variant | Fill | Text | Hover | Use |
|---|---|---|---|---|
| `primary` | `--ink` | `--on-ink` | `--ink-soft` | The confirm action of a form or step: "Simpan", "Mulai proses", "Ekspor" |
| `accent` | `--leaf` | `--ink` | `--leaf-strong` | A "create new" entry point: "+ Klip baru". At most one per screen |
| `secondary` | `--surface` + inset `1px --line-input` | `--ink` | `--mist` fill | Alternatives: "Tes", "Buka folder" |
| `ghost` | transparent | `--ink` | `--mist` on white, `--surface` on canvas | Cancel, low-priority actions |
| `danger` | `--danger-soft` | `--danger` | adds an inset `1px --danger` ring | Destructive action in a list. Inside a confirm modal it becomes solid `--danger` with `--on-ink` text |

- **Sizes:** `sm` 36 px tall with 16 px side padding (tables, toolbars); `md` 44 px with 22 px (default); `lg` 52 px with 28 px (wizard, Cari Video submit).
- **Typography:** the `label` token. A leading icon is optional; a trailing arrow appears only when the button navigates.
- **Pressed:** `scale(.97)` for `--dur-fast`.
- **Disabled:** `--canvas` fill, `--text-disabled` text, `cursor: not-allowed`.
- **Loading:** a spinner replaces the leading icon, the label stays, and the width does not change.
- **Icon button:** a 40 px circle (`sm` 32 px). Variants: surface, ghost, ink.
- **Create button:** a 48 px leaf circle with an ink "+" icon, used inside create-cards.

### 8.2 Input (`InputField.tsx`, `SelectField.tsx`, `TextAreaField.tsx`, `settings/SecretField.tsx`)

```css
.input {
  height: 44px;
  padding: 0 20px;
  border: 0;
  border-radius: var(--r-full);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line-input);
  font: 400 14px/20px var(--font-text);
  color: var(--text);
  transition: box-shadow var(--dur-fast) var(--ease-out);
}
.input::placeholder { color: var(--text-subtle); }
.input:hover { box-shadow: inset 0 0 0 1px var(--text-muted); }
.input:focus-visible { outline: none; box-shadow: inset 0 0 0 1.5px var(--ink), 0 0 0 4px var(--leaf); }
.input[aria-invalid='true'] { box-shadow: inset 0 0 0 1.5px var(--danger), 0 0 0 4px var(--danger-soft); }
```

- **Textarea:** radius `--r-md`, padding 14 px 20 px.
- **Label:** above the field, `label` token, 6 px gap. Helper text below in `caption`, `--text-muted`. An error replaces the helper text, in `--danger` with an alert icon.
- **Leading icon:** 18 px, `--text-subtle`, 16 px from the left edge.
- **Select:** the same pill with a chevron; its menu is a popover (§8.11).
- **Secret field:** an input with an eye icon button inside on the right, plus a `secondary sm` "Tes" button outside. The test result appears as a status badge below.
- **Number stepper** (Jumlah Klip): a pill with a 32 px "−" icon button, the value in `mono`, and a "+" icon button.

### 8.3 Segmented control (`Tabs.tsx`)

- **Track:** `--canvas` (inside a white card) or `--surface` (on canvas), 4 px padding, `--r-full`.
- **Segments:** 36 px tall, 16 px side padding, `label` token, `--text-muted`.
- **Active segment:** an ink pill with `--on-ink` text that slides between segments (`--dur-base`, `--ease-out`).
- **Accessibility:** `role="tablist"`, arrow keys move between segments.
- **Example:** Cari Video's "Link YouTube | Upload Video".

### 8.4 Chips

32 px tall (28 px in dense lists), `--r-full`, `caption` token.

| Kind | Look | Use |
|---|---|---|
| Choice, off | `--surface` + inset `1px --line-input`, ink text | Duration options ("45–60 dtk"), filters |
| Choice, on | `--ink` fill, `--on-ink` text, check icon | Selected option |
| Tag | `--dew` fill, `--moss` text | Clip tags ("quotable", "emotional") |
| Compound | Two same-fill pills joined by a goo bridge (§4.2.5) | Hero card status |

### 8.5 Badge (`Badge.tsx`)

28 px pill, `caption` token, icon + word. Color is never the only signal.

| Status | Fill | Text | Icon |
|---|---|---|---|
| `running`, `rendering`, `processing` | `--ink` | `--on-ink` | spinner |
| `pending`, `queued` | `--canvas` | `--ink` | clock |
| `ready` (clip) | `--leaf` | `--ink` | check |
| `completed`, `exported` | `--dew` | `--moss` | check |
| `interrupted` | `--warning-soft` | `--warning` | pause |
| `failed` | `--danger-soft` | `--danger` | alert |
| `cancelled` | `--canvas` | `--text-muted` | x |

**Viral score:** a 36 px circle (or pill) showing the number in Outfit 500.

- ≥ 80: leaf fill, ink text
- 60–79: dew fill, ink text
- below 60: canvas fill, `--text-muted`

It has the tooltip "Skor viral" and `aria-label="Skor viral 87"`.

### 8.6 Card (`GlassCard.tsx` → `Card.tsx`)

| Variant | Background | Text |
|---|---|---|
| `surface` (default) | `--surface` | `--text` |
| `mist` | `--mist` | `--text` |
| `leaf` | `--leaf` | ink only |
| `ink` | `--ink` | `--on-ink`; accents in leaf |
| `dashed` | transparent + dashed outline | `--text` |

- Radius `--r-lg`, padding 24 (or 20 when compact).
- A clickable card is a `<button>` or `<a>`. It lifts to level 2 on hover and shows a focus ring.
- **Header:** an `h2` or `h3` title, an optional icon tile on the left (§8.7) and an optional icon button on the right.
- **Card header bar:** a pill with the title on the left and an action icon on the right (the reference's "Last notes" bar). Use it only when that action exists.

### 8.7 Icon tile

A 44 px ink square with `--r-sm` corners. Two leaf quarter-circles sit on opposite corners as decoration, with a white 18 px icon in the middle. It marks a card's topic on tinted cards.

```css
.icon-tile { position: relative; width: 44px; height: 44px; border-radius: var(--r-sm); background: var(--ink); color: var(--on-ink); display: grid; place-items: center; overflow: hidden; }
.icon-tile::before, .icon-tile::after { content: ''; position: absolute; width: 22px; height: 22px; border-radius: 50%; background: var(--leaf); }
.icon-tile::before { top: -11px; right: -11px; }
.icon-tile::after { bottom: -11px; left: -11px; }
.icon-tile > svg { position: relative; }
```

### 8.8 Stat card

A card with a notch badge (§4.2.2), an optional corner blob, a `display` number and a `body` label in `--text-muted`, all aligned to the bottom-left. It is 200 px tall in the bento.

- **The number is real engine data** (`/api/dashboard/stats`, jobs, storage).
- With no data, it shows "0" plus the next step ("Belum ada klip, mulai dari Cari Video"), never a made-up value.
- Show a change ("+3 minggu ini") only when the comparison period is real and named.

### 8.9 Progress (`ProgressBar.tsx`)

- **Bar:** 8 px tall, `--r-full`.
  - On white: `--line` track, `--ink` fill.
  - On tinted cards: white at 60 % for the track.
  - On ink: `--ink-line` track, `--leaf` fill.
  - The percentage sits next to it in `mono`.
  - Width changes animate over 300 ms (`--ease-out`), driven only by WS events.
- **Progress row** (the reference's month rows): a 44 px pill with an inset `1.5px` outline track (white at 70 % on leaf cards, `--line-input` on white).
  - Fill is `--surface`; one highlighted row may use an `--ink` fill with `--on-ink` label.
  - Label on the left (`label`), value on the right (`mono`).
  - Used for storage per category and per agent on Sistem.
- **Pipeline steps** (job card: Discovery → Analisis → Proses): three pills joined by a 2 px connector.
  - Done: `--dew` with a moss check.
  - Active: `--ink` with a spinner.
  - Upcoming: `--surface` with an inset `--line-input` outline and `--text-muted`.
  - The connector is ink once the step before it is done.

### 8.10 Tooltip

- `--ink` fill, `--on-ink` text in `caption`, radius `--r-sm`, padding 6 × 10, max-width 240, 6 px arrow.
- Appears after 300 ms on hover and immediately on keyboard focus.
- Required on every icon-only control. An optional variant has a leading info icon.

### 8.11 Popover, dropdown, menu (`Dropdown.tsx`, `AgentSwitcher.tsx`, `DatePicker.tsx`)

- `--surface`, radius `--r-md`, `1px solid var(--line)`, `--shadow-1`, padding 6.
- Items are 40 px tall with radius `--r-sm` and 12 px side padding; hover `--mist`.
- The selected item has weight 600 and a check icon.
- A destructive item uses `--danger` text and is separated by a hairline.
- Full keyboard support: arrows, Enter, Esc, typeahead.

### 8.12 Modal (`Modal.tsx`, `ConfirmModal.tsx`)

- `--surface`, radius `--r-xl`, padding 32, width 480 (or 640 for forms), over `--scrim`.
- Title in `h2`, body in `body`. Actions are right-aligned: `ghost` or `secondary` first, then `primary` (or solid `danger` for destructive confirms).
- A close icon button sits top-right.
- Focus is trapped, Esc closes, and focus returns to the trigger.
- Enter: opacity 0 → 1 and `scale(.98)` → 1 over `--dur-base`.

### 8.13 Toast (`ToastProvider.tsx`, react-hot-toast)

- `--ink`, radius `--r-md`, padding 12 × 16, `--on-ink` text, bottom-right with 24 px inset and an 8 px gap between toasts.
- **Leading 28 px circle:** leaf with an ink check (success), `--danger-soft` with a danger icon (error), `--warning-soft` with a warning icon (warning).
- **Action** (e.g. "Buka folder"): a text button in `--leaf`.
- Success toasts close after 5 s. Error toasts stay until closed.

### 8.14 Toggle, checkbox, radio, slider (`ToggleSwitch.tsx`, `PremiumSlider.tsx`)

- **Toggle** (44 × 24 track, 18 px knob):
  - Off: `--surface` track with inset `1.5px --line-input` and a `--line-input` knob.
  - On: `--ink` track with a `--leaf` knob.
- **Checkbox** (20 px, radius 6):
  - Unchecked: inset `1.5px --line-input`.
  - Checked: `--ink` fill with a white check.
- **Radio** (20 px circle): checked shows an ink ring and an ink dot.
- **Slider:**
  - Track 6 px, `--line`, with an `--ink` fill.
  - Thumb: 20 px `--surface` circle with an inset `2px --ink` ring.
  - While dragging, the value shows in a `mono` tooltip.

### 8.15 Drop zone and create-card (`discover/VideoFilePicker.tsx`)

- A dashed card (§4.2.7), at least 200 px tall, with its content centered:
  - a 48 px leaf circle with an upload or plus icon
  - a `label` title ("Seret video ke sini atau pilih file")
  - a `caption` line ("MP4, MKV, MOV, WEBM, M4V, AVI · file dipakai di tempatnya, tidak disalin")
- **Drag-over:** `--mist` fill with a `2px dashed var(--ink)` outline.
- **Error:** a `--danger` dashed outline and the message below.
- The whole zone is a button (Enter or Space opens the file dialog).

### 8.16 Table

- Sits inside a surface card. The header row uses `caption` in `--text-muted`, sentence case, with no fill.
- Rows are 56 px tall (48 px when dense), separated by `--line` hairlines. No zebra stripes.
- **Hover:** a `--mist` row background with radius `--r-md`, inset 4 px. **Selected:** `--dew`.
- **First column:** a 32 px circle (dew fill, moss icon) and the primary text in `label`.
- Numbers, sizes and durations are right-aligned in `mono`.
- Row actions are icon buttons that appear on hover or `:focus-within`, and only for actions that exist. No generic three-dot menu.
- Columns come from the decision the user makes. For example, Antrian puts status and "Lanjutkan" first.

### 8.17 Video stage (clip editor, Brand Template preview)

- An `--ink` card with radius `--r-xl` and 24 px padding. The 9:16 preview is centered with radius `--r-md`. The parent of the preview keeps `container-type: inline-size` (CLAUDE.md §5.4).
- **Controls below the preview:**
  - ghost-on-ink icon buttons (white icons, `--ink-soft` hover)
  - the timecode in `mono`: current time in `--on-ink`, total in `--on-ink-muted`
- **Timeline:**
  - Track: 40 px tall, `--ink-soft`, radius `--r-sm`.
  - Kept segments: `--ink-line`. Cut ranges (fillers, pauses): hatched at 20 % `--on-ink-muted`.
  - Viral segment markers: `--leaf`.
  - Playhead: a 2 px white line with a 10 px knob.
- **Overlay controls on the video:** the only glass in the app (§6).

### 8.18 Subtitle word editor

- Words are 32 px pills: `--surface` with inset `1px --line`, in `body`.
- **Current word** (at the playhead): `--leaf` fill, ink text.
- **Keyword:** inset `1.5px --ink` outline and weight 600.
- **Emoji mark:** shown after the word at caption size.
- **Filler word:** `--text-subtle` with a strikethrough, since it is cut from the export.
- **Editing:** the pill turns into an input with the focus style (§8.2).

### 8.19 Preset and template pickers

- A grid of `--r-md` surface cards, each with a live preview thumbnail and its name in `label`.
- **Selected:** an inset `2px --ink` ring and a leaf notch badge with a check.

### 8.20 Avatar (`Avatar.tsx`)

- An agent avatar is a circle: 44 px in popovers, 32 px in lists. It shows the initials in Jakarta 600, ink.
- Its fill is picked by a hash of the agent ID from mist, dew, sage and leaf. All four keep ink text at 11.8:1 or more.

### 8.21 Wizard stepper (`app/setup`)

- Five 32 px numbered circles joined by a 2 px line.
  - Done: `--leaf` with an ink check.
  - Current: `--ink` with a white number.
  - Upcoming: `--surface` with an inset `--line-input` outline and a `--text-muted` number.
- The step name appears below each circle in `caption`.

### 8.22 Skeleton, spinner, empty state (`Skeleton.tsx`, `Spinner.tsx`, `EmptyState.tsx`)

- **Skeleton:** a `--skeleton` block with the target's radius, with a 1.4 s shimmer toward `--canvas` while loading. Static when reduced motion is on.
- **Spinner:** 20 px, 2 px stroke.
  - On light: `--line` track with an `--ink` arc.
  - On ink: `--ink-line` track with a `--leaf` arc.
  - It spins only while something real is running.
- **Empty state:** a dashed or mist card with an `h3` title, one sentence giving the cause, and one action.
  - Example: "Belum ada klip untuk agent ini. Tempel link YouTube di Cari Video untuk membuat yang pertama." + accent button "+ Klip baru".
  - A filtered-to-nothing list, a first run and an error each get different copy.

### 8.23 Scrollbar

```css
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--line-dashed); border: 2px solid var(--canvas); border-radius: var(--r-full); }
::-webkit-scrollbar-thumb:hover { background: var(--line-input); }
```

---

## 9. Data visualization

- **Title the question** the chart answers: "Klip dibuat per hari, 7 hari terakhir", not "Overview". If a sentence answers it better, write the sentence.
- **Stacked-cell bars** for small integer counts (≤ 10 per bar):
  - One cell is one unit: 44 × 36, radius `--r-sm`, `1px solid var(--line-input)`.
  - The top cell is filled `--ink` and carries the value in Outfit 15/500, `--on-ink`.
  - Larger counts use regular bars: ink fill, radius `--r-sm` on top.
- **Line:** a smooth monotone curve with a 2.5 px `--moss` core over an 8 px `--leaf` underlay, round caps. No point markers; hovering shows a chart tooltip (popover style, §8.11).
- **Series order:** ink, then leaf (with a moss outline), then sage (with an ink outline). At most three series. Green marks always carry a label or an outline, because leaf on white is 1.56:1.
- **Axes:** no gridlines and no frame. Labels use `caption` in `--text-muted`. Day labels: "Sen Sel Rab Kam Jum Sab Min".
- **Data:** only real engine data. With too little data, show the empty state, not a demo curve.

---

## 10. Motion

| What | Duration | Easing |
|---|---|---|
| Hover color, icon color | `--dur-fast` 120 ms | `--ease-out` |
| Press (`scale(.97)`) | 120 ms | `--ease-out` |
| Segment slide, popover in, card lift | `--dur-base` 200 ms | `--ease-out` |
| Rail bite glide (signature) | `--dur-slow` 320 ms | `--ease-spring` |
| Modal in | 200 ms | `--ease-out` |
| Progress width | 300 ms | `--ease-out` |

- Nothing animates on a loop, except a spinner for a real running job and the skeleton while loading.
- No entrance animations on page content. Pages appear at once.
- **`prefers-reduced-motion: reduce`:** remove translate, scale and spring (the rail bite jumps), keep opacity fades of 150 ms or less, and make skeletons static.

---

## 11. Screens

Each screen is built around the decision the user makes there. Decoration follows §1.2.

| Screen | The user's question | Composition | Decoration |
|---|---|---|---|
| **Beranda** (`/dashboard`) | "What is ready, and what is still running?" | `h1` = agent name, subtitle summarizing ready clips and running jobs. Bento row: tilted stat card "Klip siap ekspor", stat card "Job selesai", create-card "Buat klip baru", ink hero "Proses berjalan" (live %, compound chip for step and clip count; it becomes "Tempel link YouTube" when nothing runs). Below: an 8-col chart card (clips per day) and a 4-col leaf card with active jobs as progress rows. Then the latest clips as a thumbnail strip. | Expressive |
| **Cari Video** (`/discover`) | "Which video, and how many clips?" | One centered card, max 760: segmented "Link YouTube / Upload Video"; a large pill input with paste, or the drop zone; duration choice chips; clip-count stepper; `lg primary` "Mulai proses". | Quiet; the drop zone is the only dashed element |
| **Antrian** (`/jobs`) | "Which job needs me?" | Failed and interrupted jobs first, as cards with pipeline steps and "Lanjutkan" / "Batalkan"; running jobs next, with live bars; finished jobs last, as a table. | Quiet |
| **Hasil Clip** (`/clips`) | "Which clip should I edit or export?" | Status segmented filter. A grid of 9:16 thumbnail cards (radius `--r-md`) with a score badge as a top-left notch, duration `mono` pill bottom-right and status badge; hover lifts the card and shows "Edit" / "Ekspor". | Quiet |
| **Clip editor** (`/clips/detail?id=`) | "Are the words and style right?" | Fixed top bar with title, save state, "Ekspor" (primary). Three columns: word editor (white, 360) · ink stage · style panel (white, 360: preset picker, font, AI subtitle settings). | None |
| **Brand Template** | "What will my clips look like?" | Template list (left, 300) · settings in collapsible card sections · ink stage preview. | None |
| **Pengaturan** | "Are my keys and settings correct?" | Single column, max 760; one white card per group (LLM, Whisper, processing, export folder, yt-dlp); secret fields with "Tes". | None |
| **Sistem** | "Is everything healthy, and where is my space going?" | Health checks as rows with badges; a leaf storage card with progress rows (db, library, cache, per agent); actions (Update yt-dlp, Backup sekarang, Pindahkan Lokasi Data, Buka folder log) as secondary buttons. | Quiet |
| **Super Agents** | "Which workspace, with which template?" | Cards per agent: avatar, name, niche, default template chip, clip count, actions. | Quiet |
| **Setup Wizard** (`/setup`) | "What do I need before the first clip?" | Centered card (radius `--r-xl`, max 720) with the stepper on top. The welcome step may use a corner blob and the logo. | Expressive on step 1, quiet after |
| **Startup error and recovery** (Electron main, inline HTML) | "Why didn't it start, and what now?" | The same tokens: canvas, one surface card (radius 28), ink pill primary button, secondary button, `mono` path. | None |

---

## 12. Accessibility (WCAG 2.2 AA)

- **Contrast:** use only the pairs in §2.5. Body text ≥ 4.5:1; control boundaries and state indicators ≥ 3:1.
- **Focus:**
  - Every focusable element shows `outline: 2px solid var(--ink); outline-offset: 2px` (on ink surfaces, `--leaf`).
  - Inputs use the ink border plus the leaf halo (§8.2).
  - Never remove focus without a replacement.
- **Icon-only controls:**
  - The rail items, icon buttons and notch links have `aria-label` and a tooltip.
  - The active rail item has `aria-current="page"`.
  - Decorative SVGs (bite, blobs, contours, icon tile dots) are `aria-hidden`.
- **Targets:** at least 32 × 32 px. Rail items and default buttons are 44 px.
- **Keyboard:** segmented controls and menus use arrow keys, modals trap focus and close on Esc, and the drop zone opens with Enter or Space. The editor shortcuts follow CLAUDE.md §9.3.
- **Never color alone:** statuses have an icon and a word, scores show the number, chart marks have labels or outlines.
- **Windows High Contrast:** the design relies on fills, so add borders back when colors are forced:

```css
@media (forced-colors: active) {
  .card, .input, .btn, .chip, .badge, .rail { border: 1px solid CanvasText; }
  .rail-bite { display: none; }
  .rail-item[aria-current='page'] { outline: 2px solid Highlight; }
}
```

- **Scaling:** correct at 100–200 % Windows display scaling. Sizes are in px, and Electron's zoom factor handles DPI. Text never truncates without a tooltip that shows the full value.

---

## 13. Implementation and migration

### 13.1 Tokens

Replace the `:root` block in `frontend/styles/globals.css` with §2.7. During the migration, keep the old names as aliases so unmigrated screens keep working:

| Old token | Alias to | Note |
|---|---|---|
| `--bg-deep` | `--canvas` | |
| `--bg-dark` | `--canvas` | |
| `--bg-glass`, `--bg-glass-hover`, `--bg-glass-active` | `--surface`, `--mist`, `--dew` | |
| `--border-glass` | `--line` | |
| `--border-glass-glow` | `--line-input` | |
| `--primary`, `--primary-hover` | `--ink`, `--ink-soft` | Blue is gone. Primary actions are ink |
| `--primary-glow`, `--accent-glow` | `transparent` | No glows |
| `--accent` | `--leaf` | As a text color it must become `--moss` |
| `--text-primary` | `--text` | |
| `--text-dim` | `--text-muted` | |
| `--text-muted` (old) | `--text-subtle` | **The name changes meaning**; check each use |
| `--font-sans` | `--font-text` | |

Remove the aliases once `grep -rn "var(--bg-glass\|var(--primary\|var(--accent\|var(--text-primary\|var(--text-dim" frontend` returns nothing.

### 13.2 Steps

1. **Tokens:** §13.1.
2. **Classes.**
   - Delete `.glass-panel`, `.glass-card-glowing` and `.viral-badge`.
   - Rebuild `.btn-primary`, `.btn-secondary` and `.glass-input` (renamed `.input`) per §8.
   - Add `.card`, `.notch`, `.goo`, `.rail`, `.icon-tile`, `.chip` and `.badge`.
   - `body` drops its radial-gradient background.
3. **Inline styles.** Components and `app/(dashboard)/layout.tsx` hard-code colors (`rgba(10, 10, 15, 0.85)`, `rgba(24, 86, 255, 0.1)`, gradient text). Move them to classes and tokens as each file is touched. No raw hex or rgba outside the token block.
4. **Shell.** Rewrite `app/(dashboard)/layout.tsx` from the 260 px sidebar to the logo, rail and top bar in §5.2.
   - `NavLink.tsx` becomes the rail item.
   - `AgentSwitcher.tsx` moves into the top-bar pill group.
   - The version and engine status move into the Sistem button's tooltip and the Sistem page.
5. **Components.**
   - `GlassCard.tsx` → `Card.tsx` with the variants in §8.6.
   - Restyle `PremiumSlider`, `PremiumColorPicker`, `Tabs`, `Badge`, `ProgressBar`, `Modal`, `ToastProvider` and `EmptyState` per §8.
6. **Electron.** In `desktop/src/main/index.ts`:
   - The `BrowserWindow` `backgroundColor` changes from `#030307` to `#F4F6F2`, so there is no dark flash at startup.
   - The inline startup-error and recovery HTML uses the same tokens (§11).
7. **Scope check.** Nothing in `frontend/lib/presets/`, `render-engine/` or a Brand Template's caption and brand settings changes.
8. **Verify each migrated screen** at 1280 × 720 and 1920 × 1080, at 100 % and 150 % scaling, with keyboard only and with reduced motion on.

---

## 14. Don'ts

- Don't use glass or `backdrop-filter`, except the video overlay controls.
- Don't use glows, gradients in chrome, blue, purple or orange.
- Don't use palette greens as text on light surfaces, or `--text-muted` on leaf. Green text is `--moss`.
- Don't make a green fill the only boundary or state signal.
- Don't go over a motif's dose cap (§4.2), and don't use any motif on work screens.
- Don't tilt a card that holds controls or more than a number and a label.
- Don't use a goo bridge between pills of different fills, or inside a segmented control.
- Don't use dashed outlines for anything that is not an add or drop target.
- Don't use decorative status dots. A dot marks a real state (job count, engine problem) or does not exist.
- Don't use emoji, uppercase letter-spaced labels, or weights of 700 and above in the chrome.
- Don't add top-bar controls without a feature behind them (no search, bell, clock or weather until such features exist).
- Don't show invented numbers, deltas, chart data or rows. Show real engine data or a named empty state.
- Don't use raw colors outside the token block, or new font families.
- Don't apply UI tokens to subtitle presets, Brand Template output or rendered video.

# Logica — Design (MVP)

*Monochrome. Two screens. No component library. Everything here should be buildable in a day.*

Companion: [PLAN.md](PLAN.md) Phase 1.

---

## 1. Rules

1. **Black, white and grey only.** No accent colour, no hue anywhere, including charts, icons and the logo. Meaning is carried by fill, border weight, border style, type and position.
2. **Two typefaces, both from the system.** Sans for Logica's structure and UI. Serif for anything the author wrote. No font loading.
3. **Two screens.** Paste, then map. Nothing else in the MVP.
4. **One interaction on the map.** Click a node to see its quote. Everything else waits for Phase 2.
5. **Flat.** No shadows, no gradients, no blur. Borders and fills do all the work.

## 2. Tokens

```css
:root {
  --bg:      #FFFFFF;
  --fg:      #000000;
  --grey-1:  #F5F5F5;   /* subtle fills, hover */
  --grey-2:  #E5E5E5;   /* borders, dot grid */
  --grey-3:  #A3A3A3;   /* secondary text, disabled */
  --grey-4:  #525252;   /* labels */

  --sans:    ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --serif:   ui-serif, Georgia, "Times New Roman", serif;
  --mono:    ui-monospace, Menlo, monospace;

  --radius:  4px;
  --border:  1px solid var(--grey-2);
  --border-strong: 2px solid var(--fg);
}

@media (prefers-color-scheme: dark) {
  :root { --bg: #000000; --fg: #FFFFFF; --grey-1: #171717; --grey-2: #262626; --grey-3: #737373; --grey-4: #A3A3A3; }
}
```

Dark mode is a straight inversion, which is the one free gift of going monochrome.

Type scale: 13px node text, 14px body, 16px textarea, 20px page title. Line-height 1.4. Small-caps labels are 11px, letter-spacing 0.06em, colour `--grey-4`.

## 3. Screen 1 — Paste

Route `/`. Max width 720px, centred, generous top margin.

```
 ⊢ Logica

 ┌────────────────────────────────────────────────────────┐
 │                                                        │
 │  Paste an essay, article or argument…                  │
 │                                                        │
 │                                                        │
 │                                                        │
 │                                                        │
 └────────────────────────────────────────────────────────┘
                                             [  Map it  ]
```

- Logo is the text "⊢ Logica" in sans, 20px, black. That's the whole brand for now.
- Textarea: `--border`, `--radius`, 16px serif (it's the author's text), min-height 320px, focus state switches to `--border-strong`. Placeholder in `--grey-3`.
- Button: black fill, white text, 14px sans, `--radius`, no icon. Disabled state is `--grey-2` fill with `--grey-3` text.
- Nothing else on the page. No nav, no footer, no marketing copy.

## 4. Screen 2 — Map

Route `/map/:id`. Full-bleed canvas.

```
 ← New            "We should ban phones in schools…"            Structuring… ●

 ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·
 ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ┌──────────────────┐  ·  ·  ·  ·  ·  ·  ·  ·
 ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  │██████████████████│  ·  ·  ·  ·  ·  ·  ·  ·
 ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  │█ CONCLUSION     █│  ·  ·  ·  ·  ·  ·  ·  ·
 ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  │█ Schools should █│  ·  ·  ·  ·  ·  ·  ·  ·
 ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  │█ ban phones.    █│  ·  ·  ·  ·  ·  ·  ·  ·
 ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  └────────▲─────────┘  ·  ·  ·  ·  ·  ·  ·  ·
 ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  │  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·
 ·  ·  ·  ·  ┌───────────────┐  ·  ┌────┴──────────┐  ·  ┌───────────────┐
 ·  ·  ·  ·  │ PREMISE       │──▲  │ PREMISE       │  ┤──│ OBJECTION     │
 ·  ·  ·  ·  │ Phone use in  │  ·  │ Teachers want │  ·  │ Phones are    │
 ·  ·  ·  ·  │ class lowers  │  ·  │ them gone.    │  ·  │ needed for    │
 ·  ·  ·  ·  │ grades.       │  ·  └───────────────┘  ·  │ emergencies.  │
 ·  ·  ·  ·  └───────────────┘  ·  ·  ·  ·  ·  ·  ·  ·  └───────────────┘
```

**Top bar.** 48px, `--bg`, bottom `--border`. Left: "← New" link. Centre: first ~60 characters of the source in serif, `--grey-4`. Right: a one-word status while streaming ("Reading", "Segmenting", "Structuring", then nothing) with a small pulsing dot. Once finished, an underlined "Replay" in `--grey-4` re-animates the build from the saved map (no model calls).

**Canvas.** Dot grid in `--grey-2` at 24px spacing. Pan and zoom. No minimap, no controls, no toolbar in the MVP. Auto-layout top-down with the conclusion at the top.

**Streaming.** Nodes fade in (150ms opacity) as they arrive. Edges draw after both ends exist. No other animation.

## 5. Node anatomy

```
 ┌──────────────────────────┐
 │ PREMISE            ¶ 2   │   ← small-caps kind label left, anchor right, both --grey-4
 │ Students who use phones  │   ← proposition, 13px sans, --fg, max 4 lines then "…"
 │ in class get lower       │
 │ grades.                  │
 └──────────────────────────┘
```

Width 260px. Padding 12px. `--radius`. Everything monochrome is encoded like this:

| Meaning | Encoding |
|---|---|
| Main conclusion | Inverted: black fill, white text |
| Intermediate conclusion | `--border-strong` (2px black) |
| Premise, evidence, definition | `--border` (1px grey), white fill; kind shown by label only |
| Objection, rebuttal | Same card; the attack edge carries the meaning |
| Background | `--grey-1` fill, `--grey-3` text |
| Implicit (reconstructed) | Dashed 1px border, label reads "IMPLIED PREMISE" |
| Reported view ("some say…") | Proposition text in italic |
| Selected | 2px black outline, 2px offset |
| Hover | `--grey-1` fill |
| "Out" (Phase 3) | 40% opacity |

## 6. Edges

| Meaning | Encoding |
|---|---|
| Support | 1px black line, filled triangle arrowhead ▲ |
| Attack | 1px black line, flat bar terminator ⊣ |
| Routing | Orthogonal, sharp right-angle bends, no curves or rounded corners |
| Implicit | Dashed line |
| Connected to selected node | 2px; all other edges drop to `--grey-3` |

Two line terminators are the entire edge vocabulary. Rebut, undercut and undermine all use the bar in the MVP; where the bar lands (claim, edge, or premise) is Phase 2.

## 7. Quote panel

Clicking a node opens a panel on the right, 360px wide, `--bg`, left `--border`. Contents, top to bottom:

- Kind label, small caps.
- Proposition, 14px sans.
- The verbatim quote, 15px **serif**, `--grey-4` left border 2px, indented. This is the author's voice and it should look like it.
- Anchor, 12px mono (`¶ 2` for now; page or timestamp later).

Close with a "×" top-right or by clicking the canvas. On phones the same panel slides up from the bottom at 60% height.

## 8. Build notes

- **Tailwind v4** with the tokens above as CSS variables. No shadcn, no icon library. The only glyphs needed are ←, ×, ▲ and ⊣, and they're text.
- **React Flow** with one custom node component and two custom edge markers. **elkjs** layered layout, direction down.
- **Serif is a rule, not a taste.** Anywhere the author's words appear (textarea, top-bar title, quote panel) is serif. Anywhere Logica speaks is sans. Don't mix.
- Keep contrast: `--grey-3` is the lightest colour allowed for text, and only for secondary text at 12px and up.

## 9. Deferred

Source pane with synced highlighting, inspector with critical questions and ops, foundations panel, sharing, export, minimap, keyboard navigation, any hue at all.

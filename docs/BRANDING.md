# OpenXol — Branding

## Identity

| Attribute | Value |
|-----------|-------|
| **Name** | OpenXol |
| **Pronunciation** | "open-zol" |
| **Positioning** | Open-source alternative to otter.ai |
| **License** | MIT |
| **App ID** | `com.openxol.app` |

## Tagline

Placeholder — choose one before public launch:
- "Meeting intelligence, open to everyone."
- "Transcribe. Diarize. Understand."
- "Your meetings, your data."

## Domain

Check availability before committing: `openxol.com`, `openxol.io`, `openxol.app`

## Colors

TBD — define before shipping UI. Document as CSS custom properties in `src/renderer/css/styles.css`:

```css
:root {
  --color-primary:   /* TBD */;
  --color-secondary: /* TBD */;
  --color-bg:        /* TBD */;
  --color-surface:   /* TBD */;
  --color-text:      /* TBD */;
  --color-error:     /* TBD */;
  --color-warning:   /* TBD */;
  --color-success:   /* TBD */;
}
```

All UI components must reference these variables — no hardcoded hex values in component styles.

## Logo

Source SVG: `assets/icon.svg`. Platform assets:
- `assets/icon.icns` — macOS
- `assets/icon.ico` — Windows
- `assets/icon.png` — Linux / general

Regenerate platform assets from `icon.svg` when the logo changes. Do not edit platform assets directly.

## Voice & Tone

- Direct and technical — no marketing fluff in UI copy
- Error messages: state what failed and what the user can do next
- Progress messages: use present participle ("Transcribing…", "Downloading model…")
- No emoji in production UI

# OpenXol Branding Guide (`branding.md`)

This document defines the visual identity for **OpenXol**, an open-source, local-first meeting intelligence platform. It balances a "Clean Professional" aesthetic with "Futuristic Glass" accents.

## 1. Brand Essence

*   **Mission:** To provide a private, performant, and open-source alternative to proprietary meeting transcription services.
*   **Vibe:** Minimalist, trustworthy, and technologically advanced.
*   **Core Principle:** "Clarity over Clutter."

---

## 2. Visual Style: "Clean Glass"

The interface utilizes a **High-Contrast Minimalist** approach. The majority of the workspace is clean and white, while specialized "Intelligence" or "Active" components utilize futuristic glassmorphism.

### Card Architecture
1.  **Standard Cards (The Majority):**
    *   **Background:** Solid White (`#FFFFFF`).
    *   **Border:** Very subtle light gray (`#E2E8F0`).
    *   **Shadow:** Large, soft blur with low opacity (`0 4px 20px rgba(0, 0, 0, 0.03)`).
    *   **Radius:** `24px` for a modern, friendly feel.

2.  **Special Glass Panels (The Accents):**
    *   Reserved for: Active Recording, AI Summary Hero, and Primary Action buttons.
    *   **Effect:** Translucent white-to-blue gradient with `backdrop-filter: blur(12px)`.
    *   **Edge:** `1px` solid border with `rgba(255, 255, 255, 0.4)` to simulate a glass edge.

---

## 3. UI Color Palette

### Primary & Backgrounds
*   **Main Background:** `#F8F9FD` (Off-white with a hint of blue-gray).
*   **Predominant Card:** `#FFFFFF` (Solid White).
*   **Typography (Primary):** `#1E293B` (Deep Navy Gray).
*   **Typography (Secondary):** `#64748B` (Muted Slate).

### Accent & State Glows
*   **Active Recording:** `#FF4B4B` (Vibrant Red). Used for recording indicators and pulsars.
*   **Intelligence/Sync:** `#48D1E2` (Electric Cyan). Used for transcription progress and AI status.
*   **Insight/Analysis:** `#8B5CF6` (Soft Violet). Used for Gemini-powered summary highlights.

---

## 4. Hierarchy & Interaction States

### State: Idle / Archive
*   **Visuals:** Predominantly white cards. Clean, list-based layouts. 
*   **Interaction:** Hovering over a white card creates a subtle scale-up (`1.01x`) and a soft Cyan shadow glow.

### State: Active Recording (The "Hero" State)
*   **Visuals:** The white "New Recording" card transforms into a **Full Glassmorphic Panel**.
*   **Feedback:** 
    *   The border glows with a **Red Aura** (`#FF4B4B`).
    *   The background utilizes `backdrop-filter` to blur the rest of the UI slightly behind it.
    *   Real-time waveform rendered in high-contrast Cyan against the dark glass.

---

## 5. Typography & Component Specs

*   **Font:** **Inter** (Primary) or **Geist Sans** (for a more technical look).
*   **Buttons:**
    *   *Standard:* White background, thin border, navy text.
    *   *Primary (Record):* Solid Blue/Cyan gradient with high-intensity shadow.
*   **Icons:** Thin-stroke (`1.5px`) line icons. Avoid filled icons unless indicating an active toggle state.

---

## 6. Logo: The OpenXol Glyph

The logo consists of a stylized **"OX"** monogram.
*   **The 'O':** A perfect circle representing "Open" and "Privacy Shield."
*   **The 'X':** Two intersecting audio wave pulses.
*   **Implementation:** On white cards, the logo is Navy. On Glass panels, the logo becomes a vibrant, glowing White/Cyan.

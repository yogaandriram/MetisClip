---
name: glassmorphism
description: Frosted glass effect with translucent layers, subtle blur, and luminous borders for depth and modern elegance.
license: MIT
metadata:
  author: typeui.sh
---

<!-- TYPEUI_SH_MANAGED_START -->
# Glassmorphism Design System Specification (MetisClip)

This document serves as the single source of truth for the **MetisClip** Glassmorphism design system. It defines the visual styles, design tokens, component rules, spacing, accessibility constraints, and transition guidelines for both developers and AI agents.

---

## 🎯 1. Design Intent & Brand Goals
*   **Mission**: Establish a highly polished, dark-first premium dashboard theme utilizing a frosted glass aesthetic (*liquidglass* effect) with subtle luminous highlights, deep gradients, and crisp spacing.
*   **Aesthetic Identity**: Clean, high-contrast, professional, and elegant, prioritizing readable typography and smooth micro-animations.

---

## 🎨 2. Design Tokens & Foundations

### Color Tokens
Saturated, high-contrast primary values paired with soft translucent layers to create beautiful depth.

| Token | CSS Variable | Hex / RGBA Value | Role / Usage |
| :--- | :--- | :--- | :--- |
| **Deep Space** | `--bg-deep` | `#030307` | Core page body backdrop |
| **Coal Panel** | `--bg-dark` | `#07070F` | Sub-surface panel background |
| **Frosted Glass** | `--bg-glass` | `rgba(255, 255, 255, 0.03)` | Frosted transcluent container base |
| **Liquid Blue** | `--primary` | `#1856FF` | Primary brand accent & focus state |
| **Success Green** | `--accent` | `#07CA6B` | Virality ratings & positive metrics |
| **Warm Amber** | `--warning` | `#E89558` | Queue status & schedule alerts |
| **Crimson Red** | `--danger` | `#EA2143` | Discard, cancel actions, and errors |
| **Soft Ice White** | `--text-primary` | `#F8FAFC` | High-contrast headers & core copy |
| **Slate Gray** | `--text-muted` | `#64748B` | Disabled labels & decorative elements |
| **Light Slate** | `--text-dim` | `#94A3B8` | Subtitle guides & text paragraphs |

### Typography Scale
*   **Primary & Display Font**: `Plus Jakarta Sans`
    *   *Usage*: Headings (`<h1>` through `<h6>`), action buttons, card titles, form labels.
    *   *Weights*: `300 (Light)`, `400 (Regular)`, `500 (Medium)`, `600 (Semi-Bold)`, `700 (Bold)`, `800 (Extra-Bold)`, `900 (Black)`.
*   **Data & System Font**: `JetBrains Mono`
    *   *Usage*: Timestamps, duration tickers, and raw background console logs.

### Borders & Translucent Shadows
*   **Luminous Glass Border**: `1px solid rgba(255, 255, 255, 0.08)`
*   **Deep Shadow**: `box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.25)`
*   **Hover Glow Transition**: `box-shadow: 0 20px 40px rgba(24, 86, 255, 0.12)`

---

## 🧩 3. Component-Level Rules & CSS Anatomy

### A. Frosted Containers (`.glass-panel` & `.glass-card-glowing`)
Integrates high blur backdrops (`backdrop-filter: blur(12px)`) with elegant border radius (`16px` to `20px`) and luminous highlights.

```css
.glass-panel {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.25);
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.glass-panel:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.35);
}
```

### B. Floating Action Buttons (`.btn-primary` & `.btn-secondary`)
Leverages slow floating cubic-bezier transitions to lift container box-shadows when hovered.

```css
.btn-primary {
  background: linear-gradient(135deg, var(--primary), #003cc2);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  box-shadow: 0 4px 15px rgba(24, 86, 255, 0.4);
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(24, 86, 255, 0.5);
}
```

### C. Glass Input Fields (`.glass-input`)
Translucent black text box triggering a soft Liquid Blue glow on focus.

```css
.glass-input {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.glass-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 15px rgba(24, 86, 255, 0.25);
  background: rgba(0, 0, 0, 0.5);
}
```

### D. Luminous Pill Badges (`.viral-badge`)
Translucent bright capsule badge representing high virality scoring.

```css
.viral-badge {
  background: rgba(7, 202, 107, 0.1);
  border: 1px solid var(--accent);
  color: var(--accent);
  border-radius: 20px;
  box-shadow: 0 0 15px rgba(7, 202, 107, 0.15);
}
```

---

## ⚡ 4. Transitions & Motion Design
*   **Card Lifting / Layover**: `all 0.35s cubic-bezier(0.16, 1, 0.3, 1)` for elegant, premium easing.
*   **Tactile Clicks / Press States**: `all 0.2s ease` for fast responsive feedback.
*   **Loading Skeleton Shimmer**: `shimmer 1.5s infinite linear` for persistent, non-distracting loading flows.

---

## ♿ 5. Accessibility (WCAG 2.2 AA)
*   **Contrast Ratio**: Subtitle transcripts and labels must exceed a `4.5:1` contrast ratio over their glass backing.
*   **Interactive Focus**: Interactive components must manifest a luminous focus ring when browsed via keyboard tab key.
*   **Labelling**: Form inputs must possess descriptive `aria-label` tags or explicitly linked HTML labels.

---

## 🚫 6. Prohibited Implementations (Anti-Patterns)
*   **Don't**: Use solid, unblurred solid borders (e.g., neobrutalist thick dark strokes).
*   **Don't**: Rely on flat solid block shadows. All shadows must possess blur values for floating depth.
*   **Don't**: Blend raw HSL values directly inside local CSS files; always reference established CSS token variables.
*   **Don't**: Use decorative, long-lasting animations (>400ms) which slow down dashboard interaction speeds.
<!-- TYPEUI_SH_MANAGED_END -->
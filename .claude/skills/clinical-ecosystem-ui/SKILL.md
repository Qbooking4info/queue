---
name: clinical-ecosystem-ui
description: PRIMARY DESIGN SYSTEM. Always load this skill first for any UI, frontend, CSS, or component task. Defines the mandatory dark/teal color tokens, tabular typography, and role-specific layouts for Doctor, Hospital Admin, Ambulance, and Patient views. Overrides generic color/font suggestions from other skills.
---

# Clinical Ecosystem UI & Anti-Slop Specification

## 1. Strict Anti-Slop Ban List (NEVER DO THESE)
- **No Card-In-Card Nesting:** Never place a bordered/shadowed card inside another card. Use whitespace, subtle background shifts, or `1px` hairlines (`border-white/[0.07]` or `border-slate-800/60`) to separate sections.
- **No Stat-Card Grids Above Everything:** Do not start every page with a 4-column grid of giant KPI boxes with colored icon circles in the corner.
- **No Decorative Gradients or Blobs:** Zero purple/indigo-to-cyan gradients, glassmorphic blurs (`backdrop-blur`), or glowing neon shadows.
- **No Unaligned Status Badges:** Use semantic status pills sparingly (maximum 1 per table row or referral item).
- **No Generic AI Copy:** Never write "Welcome back, Doctor! Here's what's happening today" or use emojis as UI icons. Use crisp Lucide or Phosphor icons at `16px` (`w-4 h-4`) with `1.5px` stroke width.

## 2. Color & Surface Architecture (Dark / Teal Clinical Palette)
Anchor all surfaces to a disciplined, high-contrast clinical palette using CSS variables:
- **Background Primary (Dark Mode):** `#0B1114` (Deep obsidian slate, never pure `#000000`)
- **Surface / Panel:** `#111A1E` with `1px solid rgba(255, 255, 255, 0.07)` border
- **Elevated Surface (Modals/Drawers):** `#162228`
- **Primary Brand / Action Accent:** `#0D9488` (Clinical Teal 600) — hover `#0F766E`, subtle tint `rgba(13, 148, 136, 0.12)`
- **Semantic Triage Tokens (Strict Clinical Usage Only):**
  - *Emergent / STAT (Ambulance & Critical Referral):* `#E11D48` (Rose 600)
  - *Urgent / Pending Review:* `#D97706` (Amber 600)
  - *Routine / Confirmed / Completed:* `#10B981` (Emerald 500)
- **The 80/15/5 Rule:** 80% neutral slate surfaces, 15% structural borders/secondary text, 5% teal primary action + triage status colors.

## 3. Typography & Scannability
- **UI & Clinical Text:** `Plus Jakarta Sans`, `Inter`, or `Geist Sans` — tight tracking (`-0.015em`) on headings, crisp hierarchy.
- **Identifiers & Vitals:** `JetBrains Mono` or `Geist Mono` with `font-variant-numeric: tabular-nums` (`tabular-nums` in Tailwind) MUST be used for all Patient IDs, Referral Reference Codes, timestamps, wait times, coordinates, and vital signs so columns align vertically to the pixel.
- **Hierarchy Scale:**
  - Page Title: `18px` (`text-lg font-semibold`), never giant `text-4xl` hero headers inside app views.
  - Section Header: `12px` (`text-xs font-semibold uppercase tracking-wider text-slate-400`).
  - Body / Table Cell: `14px` (`text-sm`), line-height `1.4`.

## 4. Role-Specific Layout & Density Rules
Because this app serves four different personas, NEVER use the same layout density across all roles:

### A. Doctor Portal (High-Density Clinical Workbench)
- **Layout:** Master-detail split view. Left pane: filterable referral queue (`320px–380px` width). Right pane: full clinical summary, patient history, attachment viewer, and inline "Accept / Redirect / Request Info" action bar pinned to the bottom.
- **Density:** Compact (`py-2 px-3` rows). Zero animation on switching between referrals in the queue.

### B. Hospital Admin Portal (Operational Command Table)
- **Layout:** Full-width data tables with sticky headers, inline status filters (All, Incoming, Bed Assigned, Discharged), and slide-over right drawers (`480px`) for inspecting or reassigning referrals without leaving the page.
- **Density:** High. Emphasize bed capacity indicators, department load, and SLA turnaround timers in monospace font.

### C. Ambulance / Dispatch View (High-Contrast Field Interface)
- **Layout:** Zero visual clutter. Map/route view paired with a high-contrast bottom sheet or side panel showing: Pickup Facility, Receiving Hospital, Triage Acuity Banner, ETA, and Patient Stability notes.
- **Targets:** Minimum `48px` (`h-12`) button height for one-handed tap in a moving vehicle ("En Route", "Arrived at Facility", "Handover Complete") with immediate `pointer-down` feedback.

### D. Patient Booking & Referral Tracker (Calm, Guided Consumer UX)
- **Layout:** Generous whitespace (`max-w-xl mx-auto` for flows), clear vertical timeline stepper for referral progress (Issued -> Hospital Reviewed -> Specialist Assigned -> Appointment Confirmed), and reassuring micro-copy.

## 5. Execution Protocol for Refactoring
1. **Audit First:** List the exact AI-slop patterns present in the current file (e.g., redundant cards, inconsistent spacing, missing tabular-nums).
2. **Preserve Logic:** Do not delete any React state, props, API calls, or route handlers.
3. **Componentize:** Refactor into clean, flat hierarchy using our existing UI primitives. Cover empty states, loading skeletons, and long-text truncation (`truncate min-w-0`).

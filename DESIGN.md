---
name: Noise Trap
description: Is this trend real? The usual trend test and an honest one, side by side, on NASA Earth data.
colors:
  night-ground: "#05070a"
  night-ground-raised: "#0b1016"
  plate-ink: "#e9eef2"
  plate-ink-soft: "#b8c2cc"
  caption-slate: "#8b96a2"
  hairline: "#1c2630"
  hairline-strong: "#2b3947"
  selected-fill: "#1a232d"
  usual-orange: "#d55e00"
  usual-orange-text: "#f0894a"
  honest-blue: "#0072b2"
  honest-blue-text: "#56b4e9"
  map-ocean: "#070b10"
  map-land: "#0f161e"
  map-quiet-cell: "#1f2b36"
  error-text: "#ff8f8f"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, Barlow, sans-serif"
    fontSize: "clamp(48px, 6.4vw, 92px)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Barlow Semi Condensed, Barlow, sans-serif"
    fontSize: "clamp(34px, 4vw, 52px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Barlow Semi Condensed, Barlow, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  claim:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  small:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Barlow Semi Condensed, Barlow, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.06em"
  control:
    fontFamily: "Barlow Semi Condensed, Barlow, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.04em"
rounded:
  hair: "2px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "24px"
  lg: "32px"
  xl: "48px"
  plate: "96px"
  gutter: "clamp(16px, 4vw, 64px)"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.plate-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.hair}"
    padding: "11px 16px"
  button-primary:
    backgroundColor: "{colors.plate-ink}"
    textColor: "{colors.night-ground}"
    typography: "{typography.control}"
    rounded: "{rounded.hair}"
    padding: "11px 16px"
  switch-option:
    backgroundColor: "transparent"
    textColor: "{colors.caption-slate}"
    typography: "{typography.control}"
    padding: "14px 20px"
  switch-option-usual-on:
    backgroundColor: "{colors.usual-orange}"
    textColor: "{colors.night-ground}"
  switch-option-honest-on:
    backgroundColor: "{colors.honest-blue}"
    textColor: "#ffffff"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.plate-ink-soft}"
    rounded: "{rounded.hair}"
    padding: "8px 12px"
  chip-on:
    textColor: "{colors.plate-ink}"
  input:
    backgroundColor: "{colors.night-ground-raised}"
    textColor: "{colors.plate-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.hair}"
    padding: "10px 12px"
---

# Design System: Noise Trap

## Overview

**Creative North Star: "The Night-Side Plate"**

Every section is a satellite plate in the manner of NASA Earth Observatory features: a near-black ground, the data as the only imagery, and a caption that tells you whether to believe it. The page is one long column of plates separated by hairlines, with a thin running head. Captions sit on hairline rules, never in boxes. Numbers are set inline inside sentences, in the display face, coloured by which test produced them.

The system refuses the climate dashboard: no sidebar, no KPI tiles, no card grid. Depth comes from tone, not shadow. Colour is semantic before it is anything else: orange means the usual test, blue means the honest test, and almost everything else is ink on night.

**Key Characteristics:**
- Near-black ground (#05070a), cool off-white ink, slate metadata.
- Condensed display caps for labels and controls; Barlow for reading.
- One colour pair, two meanings, never decoration.
- Hairline rules (1px) carry structure; 2px corners at most.
- The globe is the hero; its Usual/Honest fade is the signature.

## Colors

Night ground with cool ink and one colour-blind-safe pair (Okabe-Ito) that carries meaning.

### Primary
- **Usual Orange** (usual-orange / usual-orange-text): the usual (plain Mann-Kendall) test. Fill tone for map cells, verdict rules, switch state and callout tint; the lighter text tone for inline numbers and words on night.
- **Honest Blue** (honest-blue / honest-blue-text): the honest (pre-whitened, FDR-controlled) test. Fill tone for cells, rules and the honest switch state; text tone for inline numbers, the focus ring and range-slider accent.

### Neutral
- **Night Ground** (night-ground): page background, `theme-color`, text on the active Usual switch.
- **Raised Night** (night-ground-raised): inputs, code traces, chart hover labels.
- **Plate Ink** (plate-ink): headings and primary text; the primary button fill.
- **Soft Ink** (plate-ink-soft): lead paragraphs, claims, figcaptions, notes.
- **Caption Slate** (caption-slate): nav, field labels, credits, source lines, chart axis text.
- **Hairline** / **Hairline Strong** (hairline / hairline-strong): plate dividers and caption rules; control borders and figcaption rules.
- **Selected Fill** (selected-fill): neutral active state for a switch option.
- **Map Ocean / Map Land / Quiet Cell**: the globe's own ground; cells with no trend sit at quiet-cell so the data reads, not the coast.

### Named Rules
**The Two Meanings Rule.** Orange is the usual test and blue is the honest test, everywhere, including charts and maps. Never use either as an accent, a brand colour, a category hue or a direction (rising/falling).

**The Text-Tone Rule.** On night, set orange and blue text in the text tones (#f0894a, #56b4e9); the fill tones are for areas, rules and marks. The active Usual switch takes Night Ground text, because white on orange is 3.9:1.

## Typography

**Display Font:** Barlow Semi Condensed 600/700 (fallback Barlow, sans-serif)
**Body Font:** Barlow 400/600 (fallback system-ui, sans-serif)

Both are self-hosted through `@fontsource` so the demo works offline. Import only the weights in use (Barlow 400, 600; Semi Condensed 600, 700).

**Character:** an engineering grotesque, condensed for captions and controls the way a mission plate labels itself, open and plain for reading.

### Hierarchy
- **Display** (700, clamp 48-92px, 0.95): the one page question in the hero. `text-wrap: balance`.
- **Headline** (700, clamp 34-52px, 1): each plate's title, stated as a plain sentence or question.
- **Title** (700, 24px, 1.1): sub-sections inside a plate.
- **Claim** (400, 21px, 1.45, max 34ch): the hero caption sentence. Lead paragraphs are 19px, max 66ch.
- **Body** (400, 17px, 1.55): reading text, max 74ch.
- **Small** (14px, slate): rates, ranges, p-values; credits and sources at 13px.
- **Label** (600, 13px, 0.06-0.08em, uppercase, slate): form labels and verdict row terms. Nav uses the same voice at 14px.

### Named Rules
**The Inline Figure Rule.** A headline number lives inside its sentence, set in the display face at 1.5-1.9em, coloured by its test. It is never lifted into a tile or a big-number block.

**The Plain Title Rule.** Plate titles start the plate. No label, plate number or category line sits above a heading.

## Layout

A single column of full-width plates. Each plate pads `96px` top and `88px` bottom (64/56 under 900px) with a fluid side gutter (clamp 16-64px); content caps at 1240px and plates are divided by a 1px hairline. The running head is sticky, 56px tall, wordmark left, plate links right; links scroll horizontally on narrow screens with a right-edge fade.

The hero is a 5fr/7fr grid: caption left, anchored from the top so the switch never moves under the cursor; globe right, bleeding into the gutter. Under 900px the globe stacks above the caption. Paired figures use `auto-fit, minmax(300px, 1fr)` with 32px gaps; verdict rows use `minmax(260px, 1fr)`. Spacing steps are 6, 12, 24, 32, 48 and 96px.

## Elevation & Depth

Flat. There are no box shadows. Depth comes from tone (Night Ground to Raised Night) and from the globe itself. The only translucency is the running head (`rgb(5 7 10 / 0.86)` with a 10px backdrop blur) so plates pass under it.

**The No-Lift Rule.** Nothing floats. A new element separates with a hairline or a step of tone, never a shadow.

## Shapes

Hairlines and right angles. Controls and fields have 2px corners; everything else is square. Structure is drawn with 1px rules: plate dividers, caption rules above figcaptions and credits. Verdict rows and legacy cards use a 2px top rule in the test's fill colour. Map cells are squares that shrink toward the poles. A picked place is marked with an open square and its note is pinned with a short leader line ending in a small open square.

## Components

### Buttons
Quiet outlined controls in the condensed face.
- **Shape:** 2px corners, 1px Hairline Strong border.
- **Default:** transparent, Plate Ink text, 600 15px, 0.04em, padding 11px 16px. Hover lifts the border to Caption Slate.
- **Primary:** Plate Ink fill, Night Ground text, uppercase; hover goes to white. One per form.
- **Text link button:** inline, underlined with a 3px offset, for actions inside a sentence.
- **Disabled:** 50% opacity, progress cursor, while a fetch runs.
- **Focus:** 2px Honest Blue text-tone outline, 3px offset, on every focusable element.
- **Motion:** 150ms border, background and colour transitions; none under reduced motion.

### Verdict Switch
The primary action on a plate that compares the tests. A segmented pair in one 1px bordered box, uppercase options at 14px 20px. Off is slate on transparent. On takes the test's fill: Usual is orange with Night Ground text, Honest is blue with white text. State is carried by `aria-pressed`.

### Chips
Choices among variables, places or cases. Wrap with 6px gaps, 600 14px, padding 8px 12px, Soft Ink text. Selected chips take Plate Ink text and a Plate Ink border.

### Inputs / Fields
Raised Night background, 1px Hairline Strong border, 2px corners, Barlow 16px, padding 10px 12px. Labels stack above in the Label style. Range sliders use the Honest Blue text tone as accent.

### Callout
A note for when the tests disagree. A thin full 1px border at 55% orange with a 9% orange tint over Night Ground, Soft Ink text, padding 14px 16px, max 74ch, `role="note"`. Orange because it warns about the usual test.

### Verdict Rows
A definition list of usual, honest and "when will we know". Each row has a 2px top rule (orange, blue or Hairline Strong), an uppercase slate term, a 26px display verdict word, then a small line with rate, 95% range and p-value.

### Charts
Plotly with transparent paper and plot, slate axis text, faint grid (`rgba(127,127,127,0.15-0.2)`), no mode bar. Series data in a muted grey, the trend line in Plate Ink at 3px. Hover labels use Raised Night with Barlow 14px.

### Globe Plate (signature)
An orthographic globe of 5-degree square cells on Map Ocean and Map Land, coastlines in Hairline Strong, a 30-degree graticule. Cells group by verdict: quiet, usual only, both, honest only. Switching to Honest fades usual-only cells to 15% and brings honest-only cells up over 700ms with a quartic ease-out; reduced motion snaps. Drag rotates; clicking a cell pins a note with a link to the full record. `?test=honest` opens on the honest verdict.

## Do's and Don'ts

### Do:
- **Do** colour a number, rule, cell or switch only by the test that produced it: orange #d55e00 / #f0894a for usual, blue #0072b2 / #56b4e9 for honest.
- **Do** set key figures inline in the sentence, in the display face at 1.5-1.9em.
- **Do** separate with 1px hairlines and a step of tone; keep corners at 2px or square.
- **Do** put captions and credits on a hairline rule in slate, 13-14px.
- **Do** open a new plate with a plain headline, then a lead at most 66ch wide.
- **Do** give every motion a reduced-motion path and every control a visible Honest Blue focus ring.
- **Do** keep fonts self-hosted and data local so the plate works offline.

### Don't:
- **Don't** use orange or blue as an accent, category colour, brand colour or rising/falling scale.
- **Don't** build KPI tiles, big-number cards, a sidebar or a dashboard card grid.
- **Don't** put a label, plate number or category line above a heading.
- **Don't** use coloured side borders, gradient text, shadows, or emoji and unicode glyphs as icons.
- **Don't** box a caption; a warning callout takes a thin full border and tint, never a thick stripe.
- **Don't** put white text on the orange fill.

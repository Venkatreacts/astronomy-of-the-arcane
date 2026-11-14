---
version: 1
slug: "web-src-app-jsx"
primary_target: "web/src/App.jsx"
related_targets: ["web/src/App.css"]
---

# Noise Trap web app (web/src)

Scope: the whole single-page app. Mode: read (an explainer that is also a working tool). Audience: Space Apps judges and the public, laptop or projector, about 30 seconds to get it.
Job: understand that the usual trend test finds trends in noise, see the honest answer for the whole planet, then test their own place.
Constraints: works offline from web/public/data; keep orange = usual, blue = honest; no JSON field renames.
Memorable moment: the globe switches from the usual verdict to the honest one and most "changing" cells go dark.

## Direction contract

THESIS: Each finding is a satellite plate with a caption that says whether to believe it. Refuses the climate dashboard: no sidebar, no KPI tiles, no card grid.

OWN-WORLD: Night-side ground (#05070a to #0b1016), the data itself is the only imagery. Captions in Barlow Semi Condensed caps for kickers, Barlow for reading. Okabe-Ito orange #d55e00 = usual, blue #0072b2 fills (sky #56b4e9 for text) = honest, slate #7f8a96 for metadata. Plates are numbered (PLATE 01...), captions sit lower-left on hairline rules, never in boxes.

STORY: See the planet by the usual test, flip to the honest test, watch most of it go quiet. Then see why on pure noise (the trap), then test any place on Earth, scan a region, ask the detective.

FIRST VIEWPORT: Full-bleed dark orthographic globe (right 60%) of 5-degree cells for the chosen variable. Lower-left caption: kicker "PLATE 01 · EARTH 1981-2025 · NASA POWER", title "Is this trend real?", one sentence, two big numbers (usual % in orange, honest % in blue). Usual/Honest switch is the primary action, beside the numbers. Variable chips under the caption. Thin top bar: wordmark left, plate links right.

FORM: Earth Observatory plate, the pick card (position 1 on the grounded list). seed:79ea02982f0dd6c2

SIGNATURE: the verdict switch animates the globe: cells that fail the honest test fade out over 600 ms; drag to rotate; clicking a cell opens that place's series below.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

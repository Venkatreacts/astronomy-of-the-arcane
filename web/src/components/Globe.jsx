import { useEffect, useRef, useState } from 'react'
import { geoDistance, geoEquirectangular, geoGraticule, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import { api } from '../api'

// A canvas Earth: an orthographic globe or a flat whole-world map. The colour is a smooth field,
// interpolated between the 5° sample points once per paint (bilinear), with a dot at each real point;
// "squares" draws each sample point as its own curved 5° patch instead. Coastlines and borders sit on
// top of the data. Colour changes sweep across the visible map from west to east, so a switch of test
// reads as the test passing over the planet.
const SWEEP_MS = 1000 // time for the sweep to cross the map
const CELL_MS = 650 // time for one point to change once the sweep reaches it
const FADE_MS = 280 // plain cross-fade, used for year playback
const FLY_MS = 1400
const SPIN = 0.003 // idle rotation, degrees per ms
const RAD = Math.PI / 180
const DATA_ALPHA = 0.85 // the land shape reads through the colour
const ZMIN = 1
const ZMAX = 4
const TR = 2 // texels per degree of the interpolated field
const TW = 360 * TR
const TH = 180 * TR
const SLOW_MS = 30 // a field frame slower than this cannot hold about 30 fps
const SEA = '#0a131d'
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (t) => Math.min(1, Math.max(0, t))

let earthFile = null
const loadEarth = () => (earthFile ??= api.land().then((t) => ({
  land: feature(t, t.objects.land),
  lakes: feature(t, t.objects.lakes),
  coast: feature(t, t.objects.coastlines),
  borders: mesh(t, t.objects.countries, (a, b) => a !== b),
})).catch(() => null))
const graticule = geoGraticule().step([30, 30])()
const SPHERE = { type: 'Sphere' }

function patch(lat, lon, step) {
  const h = step / 2 - 0.35 // a thin gap keeps the 5° grid readable as separate samples
  const [a0, a1, o0, o1] = [lat - h, lat + h, lon - h, lon + h]
  const pts = []
  for (let i = 0; i <= 4; i++) pts.push([o0 + ((o1 - o0) * i) / 4, a1]) // parallels are not great circles,
  for (let i = 1; i <= 2; i++) pts.push([o1, a1 + ((a0 - a1) * i) / 2]) // so the edges get extra vertices
  for (let i = 1; i <= 4; i++) pts.push([o1 + ((o0 - o1) * i) / 4, a0])
  pts.push([o0, lat])
  return pts
}

const snap = (v, step) => Math.floor(v / step) * step + step / 2
const globeR = (g) => Math.max(0, (Math.min(g.w, g.h) / 2) * 0.9) // hidden panes can report negative sizes
const flatK = (g) => Math.max(0, Math.min(g.w / (2 * Math.PI), g.h / Math.PI) * 0.97)

function makeProj(g) {
  if (g.flat) return geoEquirectangular().scale(flatK(g) * g.zoom).translate([g.w / 2 + g.pan[0], g.h / 2 + g.pan[1]])
  return geoOrthographic().translate([g.w / 2, g.h / 2]).scale(globeR(g) * g.zoom).rotate(g.rot).clipAngle(90)
}
// a zoomed flat map may move only as far as its own edges
function clampPan(g) {
  const k = flatK(g) * g.zoom
  const mx = Math.max(0, (2 * Math.PI * k - g.w) / 2)
  const my = Math.max(0, (Math.PI * k - g.h) / 2)
  g.pan = [Math.max(-mx, Math.min(mx, g.pan[0])), Math.max(-my, Math.min(my, g.pan[1]))]
}

// the sample points as a regular lat/lon grid, so the field can find each texel's four neighbours
function makeGrid(cells, step) {
  const lats = cells.map((c) => c.lat)
  const lat0 = Math.min(...lats)
  const nlat = Math.round((Math.max(...lats) - lat0) / step) + 1
  const nlon = Math.round(360 / step)
  const lon0 = -180 + step / 2
  const idx = new Int32Array(nlat * nlon).fill(-1)
  cells.forEach((c, i) => {
    const k = Math.round((c.lon - lon0) / step)
    idx[Math.round((c.lat - lat0) / step) * nlon + (((k % nlon) + nlon) % nlon)] = i
  })
  return { idx, lat0, nlat, nlon, lon0, step }
}

// Bilinear field on a 0.5° equirectangular texture from per-point colours [r, g, b, alpha, scale].
// Colours are blended premultiplied, so a faint point does not tint its strong neighbour; a missing
// neighbour (soil wetness has no ocean points) is left out and the rest are re-weighted.
function texture(grid, col, mask) {
  const { idx, lat0, nlat, nlon, lon0, step } = grid
  const out = new Uint8ClampedArray(TW * TH * 4)
  let r = 0, gr = 0, b = 0, a = 0, w = 0
  const add = (k, wt) => {
    const c = idx[k]
    if (c < 0 || wt <= 0) return
    const o = c * 5
    const al = col[o + 4] < 0.02 ? 0 : col[o + 3]
    w += wt
    a += wt * al
    r += wt * al * col[o]
    gr += wt * al * col[o + 1]
    b += wt * al * col[o + 2]
  }
  for (let ty = 0; ty < TH; ty++) {
    const gy = (90 - (ty + 0.5) / TR - lat0) / step
    if (gy < -0.5 || gy > nlat - 0.5) continue // the field ends where the outer squares end
    const j = Math.floor(gy)
    const fy = gy - j
    const ra = Math.max(0, j) * nlon
    const rb = Math.min(nlat - 1, j + 1) * nlon
    for (let tx = 0; tx < TW; tx++) {
      const m = mask ? mask[ty * TW + tx] : 255
      if (!m) continue
      const gx = ((tx + 0.5) / TR - 180 - lon0) / step
      const i = Math.floor(gx)
      const fx = gx - i
      const ia = ((i % nlon) + nlon) % nlon
      const ib = (ia + 1) % nlon
      r = gr = b = a = w = 0
      add(ra + ia, (1 - fx) * (1 - fy))
      add(ra + ib, fx * (1 - fy))
      add(rb + ia, (1 - fx) * fy)
      add(rb + ib, fx * fy)
      if (w < 0.15 || a <= 0) continue
      const o = (ty * TW + tx) * 4
      out[o] = r / a
      out[o + 1] = gr / a
      out[o + 2] = b / a
      out[o + 3] = (a / w) * DATA_ALPHA * m
    }
  }
  return out
}

function buildTex(g, col) {
  const data = texture(g.grid, col, g.landOnly ? g.mask : null)
  const cvs = document.createElement('canvas')
  cvs.width = TW
  cvs.height = TH
  cvs.getContext('2d').putImageData(new ImageData(data, TW, TH), 0, 0)
  if (import.meta.env.DEV) { // self-check: the field at a sample point is that point's colour
    const i = g.cells.findIndex((c, k) => col[k * 5 + 3] > 0.5 && col[k * 5 + 4] >= 0.02)
    const c = g.cells[i]
    const o = c && (Math.floor((90 - c.lat) * TR) * TW + Math.floor((c.lon + 180) * TR)) * 4
    if (c && data[o + 3]) console.assert([0, 1, 2].every((k) => Math.abs(data[o + k] - col[i * 5 + k]) < 24), 'globe field off at a sample point')
  }
  return { col, data, cvs }
}

// land minus lakes on the texture grid, for variables measured on land only
function landMask(earth) {
  const c = document.createElement('canvas')
  c.width = TW
  c.height = TH
  const x = c.getContext('2d')
  const path = geoPath(geoEquirectangular().scale(TW / (2 * Math.PI)).translate([TW / 2, TH / 2]), x)
  x.fillStyle = '#fff'
  x.beginPath(); path(earth.land); x.fill()
  x.globalCompositeOperation = 'destination-out'
  x.beginPath(); path(earth.lakes); x.fill()
  const d = x.getImageData(0, 0, TW, TH).data
  const m = new Uint8Array(TW * TH)
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3]
  return m
}

// The field on the globe: each field pixel is projected back to lon/lat (orthographic inverse with the
// d3 rotation undone by hand) and read from the texture. Field pixels are a few CSS pixels wide and
// smoothed when drawn; the field has no detail finer than the 5° samples anyway.
function fieldGlobe(ctx, g, cx, cy, R, mixAt) {
  const FS = Math.min(6, Math.max(2, Math.ceil(Math.sqrt(Math.min(g.w * g.h, Math.PI * R * R) / 90000))))
  const fw = Math.ceil(g.w / FS)
  const fh = Math.ceil(g.h / FS)
  if (fw <= 0 || fh <= 0 || !(R > 0)) return
  if (!g.fcv) { g.fcv = document.createElement('canvas'); g.fctx = g.fcv.getContext('2d') }
  if (g.fcv.width !== fw || g.fcv.height !== fh || !g.img) {
    g.fcv.width = fw
    g.fcv.height = fh
    g.img = g.fctx.createImageData(fw, fh)
  }
  const d = g.img.data
  d.fill(0)
  const to = g.tex.data
  const from = g.texFrom?.data
  const cp = Math.cos(g.rot[1] * RAD)
  const sp = Math.sin(g.rot[1] * RAD)
  const lr = g.rot[0]
  const mix = mixAt ? Float32Array.from({ length: fw }, (_, px) => mixAt((px + 0.5) * FS)) : null
  const yA = Math.max(0, Math.floor((cy - R) / FS))
  const yB = Math.min(fh, Math.ceil((cy + R) / FS))
  for (let py = yA; py < yB; py++) {
    const v = (cy - (py + 0.5) * FS) / R
    const q0 = 1 - v * v
    if (q0 <= 0) continue
    const half = Math.sqrt(q0) * R
    const xA = Math.max(0, Math.floor((cx - half) / FS))
    const xB = Math.min(fw, Math.ceil((cx + half) / FS))
    for (let px = xA; px < xB; px++) {
      const u = ((px + 0.5) * FS - cx) / R
      const q = q0 - u * u
      if (q <= 0) continue
      const X = Math.sqrt(q)
      let lon = Math.atan2(u, X * cp + v * sp) / RAD - lr + 180
      lon -= Math.floor(lon / 360) * 360
      const lat = Math.asin(Math.max(-1, Math.min(1, v * cp - X * sp))) / RAD
      const ti = (Math.min(TH - 1, Math.floor((90 - lat) * TR)) * TW + Math.min(TW - 1, Math.floor(lon * TR))) * 4
      const o = (py * fw + px) * 4
      if (!mix) {
        d[o] = to[ti]; d[o + 1] = to[ti + 1]; d[o + 2] = to[ti + 2]; d[o + 3] = to[ti + 3]
        continue
      }
      const e = mix[px]
      const fa = from ? from[ti + 3] * (1 - e) : 0
      const ta = to[ti + 3] * e
      const A = fa + ta
      if (A < 1) continue
      d[o] = ((from ? from[ti] * fa : 0) + to[ti] * ta) / A
      d[o + 1] = ((from ? from[ti + 1] * fa : 0) + to[ti + 1] * ta) / A
      d[o + 2] = ((from ? from[ti + 2] * fa : 0) + to[ti + 2] * ta) / A
      d[o + 3] = A
    }
  }
  g.fctx.putImageData(g.img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(g.fcv, 0, 0, fw * FS, fh * FS)
}

export default function Globe({ cells, step = 5, paint, paintKey, mark, sweep = true, sweepColor = '86,180,233',
  picked, focus, onPick, describe, height, label, flat = false, squares = false, landOnly = false, onSlow }) {
  const wrap = useRef(null)
  const cvs = useRef(null)
  const [hover, setHover] = useState(null)
  const [zoom, setZoom] = useState(1)
  const s = useRef({ rot: [-50, -15], vel: [0, 0], drag: null, idleAt: -Infinity, earth: null, mask: null, w: 0, h: 0,
    geo: [], keys: new Map(), from: null, to: null, cur: null, t0: -Infinity, sweep: true, fly: null,
    hovering: false, visible: true, cells: null, dirty: true, zoom: 1, pan: [0, 0], flat: false, squares: false,
    landOnly: false, grid: null, tex: null, texFrom: null, marks: null, marksFrom: null, ptrs: new Map(), pinch: null,
    slow: { n: 0, ema: 0, sent: false } })
  const live = useRef({})
  live.current = { onPick, describe, picked, sweepColor, onSlow, zoomTo }

  // geometry and colours: a new set of cells grows in from nothing; a new paint key changes from what is shown
  useEffect(() => {
    const g = s.current
    const fresh = g.cells !== cells
    if (fresh) {
      g.cells = cells
      g.geo = cells.map((c) => patch(c.lat, c.lon, step))
      g.keys = new Map(cells.map((c, i) => [`${c.lat},${c.lon}`, i]))
      g.grid = makeGrid(cells, step)
    }
    const to = new Float32Array(cells.length * 5)
    cells.forEach((c, i) => to.set(paint(c), i * 5))
    const marks = new Uint8Array(cells.length)
    if (mark) cells.forEach((c, i) => { marks[i] = mark(c) ? 1 : 0 })
    g.from = fresh || !g.cur ? new Float32Array(cells.length * 5) : Float32Array.from(g.cur)
    if (fresh) for (let i = 0; i < cells.length; i++) g.from.set([...to.slice(i * 5, i * 5 + 3), 0, 0.2], i * 5)
    g.to = to
    g.cur = Float32Array.from(g.from)
    g.marksFrom = fresh || !g.marks ? new Uint8Array(cells.length) : g.marks
    g.marks = marks
    g.landOnly = landOnly
    g.texFrom = fresh ? null : g.tex
    g.tex = buildTex(g, to)
    g.sweep = sweep
    g.settled = false
    g.t0 = reduced() ? -Infinity : performance.now()
    g.dirty = true
  }, [cells, paintKey, landOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const g = s.current
    g.flat = flat
    g.pan = [0, 0]
    g.vel = [0, 0]
    g.resize?.() // the box changes shape now; do not wait for the resize observer
    g.dirty = true
  }, [flat])
  useEffect(() => {
    s.current.squares = squares
    s.current.dirty = true
  }, [squares])

  useEffect(() => {
    if (!focus) return
    const g = s.current
    const from = [-g.rot[0], -g.rot[1]]
    const to = [focus.lon, Math.max(-60, Math.min(60, focus.lat))]
    if (g.flat) { // the flat map shows the whole world; zoomed in, centre the point
      g.rot = [-to[0], -to[1]]
      const p = makeProj({ ...g, pan: [0, 0] })([focus.lon, focus.lat])
      g.pan = [g.w / 2 - p[0], g.h / 2 - p[1]]
      clampPan(g)
      g.dirty = true
      return
    }
    if (reduced()) { g.rot = [-to[0], -to[1]]; g.dirty = true; return }
    g.fly = { f: geoInterpolate(from, to), t0: performance.now() }
    g.idleAt = performance.now() + FLY_MS
  }, [focus])

  useEffect(() => {
    const g = s.current
    const canvas = cvs.current
    const ctx = canvas.getContext('2d')
    let raf = 0
    let last = performance.now()
    loadEarth().then((earth) => {
      if (!earth) return
      g.earth = earth
      g.mask = landMask(earth)
      if (g.landOnly && g.tex) { // the first paint had no coastline to cut the ocean away with
        g.tex = buildTex(g, g.tex.col)
        if (g.texFrom) g.texFrom = buildTex(g, g.texFrom.col)
      }
      g.dirty = true
    })

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      g.w = wrap.current.clientWidth
      g.h = wrap.current.clientHeight // the globe's height, or 2:1 for the flat map
      canvas.width = Math.round(g.w * dpr)
      canvas.height = Math.round(g.h * dpr)
      canvas.style.width = `${g.w}px`
      canvas.style.height = `${g.h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (g.flat) clampPan(g)
      g.dirty = true
    }
    g.resize = size
    const ro = new ResizeObserver(size)
    ro.observe(wrap.current)
    const io = new IntersectionObserver(([e]) => { g.visible = e.isIntersecting })
    io.observe(canvas)
    size()
    const wheel = (e) => {
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1)
      if (live.current.zoomTo(g.zoom * Math.exp(-dy * 0.002))) e.preventDefault() // at a limit the page scrolls
    }
    canvas.addEventListener('wheel', wheel, { passive: false })

    const draw = (now) => {
      const { w, h } = g
      const globe = !g.flat
      const proj = makeProj(g)
      const path = geoPath(proj, ctx)
      const k = proj.scale()
      const [cx, cy] = globe ? [w / 2, h / 2] : proj.translate()
      const R = k // globe radius in pixels
      const center = [-g.rot[0], -g.rot[1]]
      ctx.clearRect(0, 0, w, h)

      if (globe) {
        const glow = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.12)
        glow.addColorStop(0, 'rgba(86,180,233,0.22)')
        glow.addColorStop(0.35, 'rgba(86,180,233,0.07)')
        glow.addColorStop(1, 'rgba(86,180,233,0)')
        ctx.fillStyle = glow
        ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, 2 * Math.PI); ctx.fill()
        const sea = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R)
        sea.addColorStop(0, '#13212f')
        sea.addColorStop(1, '#03060a')
        ctx.fillStyle = sea
      } else ctx.fillStyle = SEA
      ctx.beginPath(); path(SPHERE); ctx.fill()

      ctx.beginPath(); path(graticule); ctx.strokeStyle = 'rgba(150,175,200,0.07)'; ctx.lineWidth = 1; ctx.stroke()
      if (g.earth) { ctx.beginPath(); path(g.earth.land); ctx.fillStyle = '#16222e'; ctx.fill() }

      // where the sweep runs: the visible part of the disk or the map
      const half = globe ? R : k * Math.PI
      const a0 = Math.max(0, cx - half)
      const a1 = Math.max(a0 + 1, Math.min(w, cx + half))
      const elapsed = now - g.t0
      const total = g.sweep ? SWEEP_MS + CELL_MS : FADE_MS
      const moving = elapsed < total
      const tAt = (x) => (g.sweep ? clamp01((elapsed - ((x - a0) / (a1 - a0)) * SWEEP_MS) / CELL_MS) : clamp01(elapsed / FADE_MS))

      // colours for this frame (squares), and where each point is
      const n = g.geo.length
      const limit = (90 - step / 2 - 1) * RAD
      const p = new Array(n)
      const vis = new Uint8Array(n)
      const tc = new Float32Array(n).fill(1)
      for (let i = 0; i < n; i++) {
        const c = g.cells[i]
        p[i] = proj([c.lon, c.lat])
        vis[i] = !globe || geoDistance([c.lon, c.lat], center) <= limit ? 1 : 0
        if (!moving) continue
        tc[i] = tAt(p[i][0])
        const e = ease(tc[i])
        for (let q = 0; q < 5; q++) g.cur[i * 5 + q] = g.from[i * 5 + q] + (g.to[i * 5 + q] - g.from[i * 5 + q]) * e
      }
      if (!moving && !g.settled) { g.cur = Float32Array.from(g.to); g.settled = true }

      const cellPx = k * step * RAD // spacing of the sample points near the centre, in pixels
      if (!g.squares && g.tex) {
        if (globe) fieldGlobe(ctx, g, cx, cy, R, moving ? (x) => ease(tAt(x)) : null)
        else {
          const [x0, y0, W, H] = [cx - k * Math.PI, cy - (k * Math.PI) / 2, 2 * k * Math.PI, k * Math.PI]
          ctx.imageSmoothingEnabled = true
          if (!moving) ctx.drawImage(g.tex.cvs, x0, y0, W, H)
          else if (g.sweep) { // a wipe: new colours behind the sweep line, old ones ahead of it
            const front = a0 + (a1 - a0) * clamp01(elapsed / SWEEP_MS)
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, front, h); ctx.clip()
            ctx.drawImage(g.tex.cvs, x0, y0, W, H)
            ctx.restore()
            if (g.texFrom) {
              ctx.save(); ctx.beginPath(); ctx.rect(front, 0, w - front, h); ctx.clip()
              ctx.drawImage(g.texFrom.cvs, x0, y0, W, H)
              ctx.restore()
            }
          } else {
            const e = ease(clamp01(elapsed / FADE_MS))
            if (g.texFrom) { ctx.globalAlpha = 1 - e; ctx.drawImage(g.texFrom.cvs, x0, y0, W, H) }
            ctx.globalAlpha = e; ctx.drawImage(g.tex.cvs, x0, y0, W, H); ctx.globalAlpha = 1
          }
        }
      } else {
        for (let i = 0; i < n; i++) {
          const a = g.cur[i * 5 + 3] * DATA_ALPHA
          const sc = g.cur[i * 5 + 4]
          if (a < 0.01 || sc < 0.02 || !vis[i]) continue
          const [px, py] = p[i]
          ctx.beginPath()
          g.geo[i].forEach((pt, j) => {
            const [x, y] = proj(pt)
            const X = px + (x - px) * sc
            const Y = py + (y - py) * sc
            if (j) ctx.lineTo(X, Y); else ctx.moveTo(X, Y)
          })
          ctx.closePath()
          ctx.fillStyle = `rgba(${g.cur[i * 5] | 0},${g.cur[i * 5 + 1] | 0},${g.cur[i * 5 + 2] | 0},${a})`
          ctx.fill()
        }
      }

      // the Earth on top of the data: lakes in the sea colour, borders, then coastlines with a dark edge
      if (g.earth) {
        ctx.beginPath(); path(g.earth.lakes); ctx.fillStyle = SEA; ctx.fill()
        ctx.beginPath(); path(g.earth.borders); ctx.strokeStyle = 'rgba(230,238,245,0.32)'; ctx.lineWidth = 0.6; ctx.stroke()
        ctx.beginPath(); path(g.earth.coast)
        ctx.strokeStyle = 'rgba(3,6,10,0.55)'; ctx.lineWidth = 2.2; ctx.stroke()
        ctx.strokeStyle = 'rgba(235,242,250,0.78)'; ctx.lineWidth = 0.8; ctx.stroke()
      }

      // the real sample points (field only), then rings on the false alarms
      if (!g.squares) {
        const r = Math.min(2.2, 0.8 + cellPx * 0.025)
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          if (!vis[i] || g.cur[i * 5 + 3] < 0.01) continue
          ctx.moveTo(p[i][0] + r, p[i][1]); ctx.arc(p[i][0], p[i][1], r, 0, 2 * Math.PI)
        }
        ctx.fillStyle = 'rgba(8,12,18,0.55)'; ctx.fill()
      }
      if (g.marks) {
        const r = Math.max(3, cellPx * 0.3)
        ctx.beginPath()
        let any = false
        for (let i = 0; i < n; i++) {
          if (!vis[i] || !(tc[i] >= 0.5 ? g.marks[i] : g.marksFrom[i])) continue
          ctx.moveTo(p[i][0] + r, p[i][1]); ctx.arc(p[i][0], p[i][1], r, 0, 2 * Math.PI)
          any = true
        }
        if (any) {
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.stroke()
          ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 1.3; ctx.stroke()
        }
      }

      if (globe) {
        const shade = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.55, cx, cy, R)
        shade.addColorStop(0, 'rgba(2,4,8,0)')
        shade.addColorStop(1, 'rgba(2,4,8,0.21)')
        ctx.fillStyle = shade
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill()
      }
      ctx.strokeStyle = 'rgba(150,205,240,0.35)'; ctx.lineWidth = 1
      ctx.beginPath(); path(SPHERE); ctx.stroke()

      if (g.sweep && elapsed < SWEEP_MS) {
        const x = a0 + (a1 - a0) * (elapsed / SWEEP_MS)
        const [top, bot] = globe ? [cy - R, cy + R] : [cy - (k * Math.PI) / 2, cy + (k * Math.PI) / 2]
        ctx.save()
        ctx.beginPath(); path(SPHERE); ctx.clip()
        const band = ctx.createLinearGradient(x - 60, 0, x + 2, 0)
        band.addColorStop(0, `rgba(${live.current.sweepColor},0)`)
        band.addColorStop(1, `rgba(${live.current.sweepColor},0.30)`)
        ctx.fillStyle = band
        ctx.fillRect(x - 60, top, 62, bot - top)
        ctx.fillStyle = `rgba(${live.current.sweepColor},0.9)`
        ctx.fillRect(x, top, 1.5, bot - top)
        ctx.restore()
      }

      const pk = live.current.picked
      if (pk && (!globe || geoDistance([pk.lon, pk.lat], center) < limit)) {
        ctx.beginPath()
        patch(pk.lat, pk.lon, step).forEach((pt, j) => { const [x, y] = proj(pt); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y) })
        ctx.closePath(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke()
        const [x, y] = proj([pk.lon, pk.lat])
        const t = (now % 1800) / 1800
        ctx.beginPath(); ctx.arc(x, y, cellPx * (0.8 + 1.6 * t), 0, 2 * Math.PI)
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - t)})`; ctx.lineWidth = 1.5; ctx.stroke()
      }
      return moving
    }

    const frame = (now) => {
      const dt = Math.min(64, now - last)
      last = now
      let busy = g.dirty
      if (g.fly) {
        const t = clamp01((now - g.fly.t0) / FLY_MS)
        const [lon, lat] = g.fly.f(ease(t))
        g.rot = [-lon, -lat]
        if (t >= 1) g.fly = null
        busy = true
      } else if (!g.drag && !g.flat && (Math.abs(g.vel[0]) > 0.001 || Math.abs(g.vel[1]) > 0.001)) {
        g.rot = [g.rot[0] + g.vel[0] * dt, Math.max(-70, Math.min(70, g.rot[1] + g.vel[1] * dt))]
        g.vel = g.vel.map((v) => v * Math.pow(0.94, dt / 16))
        busy = true
      } else if (!g.drag && !g.flat && !g.hovering && !g.pinch && now > g.idleAt + 2500 && !reduced()) {
        g.rot = [g.rot[0] + SPIN * dt, g.rot[1]]
        busy = true
      }
      if (live.current.picked) busy = true
      if (g.visible && g.w && (busy || now - g.t0 < SWEEP_MS + CELL_MS)) {
        const t0 = performance.now()
        draw(now)
        g.dirty = false
        // the smooth globe costs a projection per field pixel; if this device cannot keep about 30 fps, ask for squares
        if (!g.squares && !g.flat) {
          const sl = g.slow
          const took = performance.now() - t0
          sl.ema = sl.n ? sl.ema * 0.9 + took * 0.1 : took
          sl.n += 1
          if (sl.n > 30 && sl.ema > SLOW_MS && !sl.sent) { sl.sent = true; live.current.onSlow?.() }
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); canvas.removeEventListener('wheel', wheel); g.resize = null }
  }, [height, step])

  // returns false at a limit, so the wheel can scroll the page instead
  function zoomTo(z) {
    const g = s.current
    const nz = Math.min(ZMAX, Math.max(ZMIN, z))
    if (Math.abs(nz - g.zoom) < 1e-3) return false
    g.pan = g.pan.map((v) => (v * nz) / g.zoom)
    g.zoom = nz
    if (g.flat) clampPan(g)
    g.idleAt = performance.now() + 4000
    g.dirty = true
    setZoom(nz)
    return true
  }

  function cellAt(e) {
    const g = s.current
    const r = cvs.current.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const proj = makeProj(g)
    if (!g.flat && (x - g.w / 2) ** 2 + (y - g.h / 2) ** 2 > proj.scale() ** 2) return { x, y, i: -1 }
    const ll = proj.invert([x, y])
    if (!ll || !(Math.abs(ll[0]) <= 180 && Math.abs(ll[1]) <= 90)) return { x, y, i: -1 }
    const i = g.keys.get(`${snap(ll[1], step)},${snap(ll[0], step)}`)
    return { x, y, i: i ?? -1 }
  }

  function down(e) {
    const g = s.current
    g.ptrs.set(e.pointerId, [e.clientX, e.clientY])
    try { cvs.current.setPointerCapture?.(e.pointerId) } catch { /* pointer already gone: nothing to capture */ }
    if (g.ptrs.size === 2) { // two fingers: pinch to zoom
      const [a, b] = [...g.ptrs.values()]
      g.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z: g.zoom }
      g.drag = null
      setHover(null)
      return
    }
    if (g.ptrs.size > 2) return
    g.drag = { x: e.clientX, y: e.clientY, rot: [...g.rot], pan: [...g.pan], moved: 0, lx: e.clientX, ly: e.clientY, lt: performance.now() }
    g.vel = [0, 0]
    g.fly = null
  }
  function move(e) {
    const g = s.current
    if (g.ptrs.has(e.pointerId)) g.ptrs.set(e.pointerId, [e.clientX, e.clientY])
    if (g.pinch) {
      if (g.ptrs.size >= 2) {
        const [a, b] = [...g.ptrs.values()]
        zoomTo((g.pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1])) / g.pinch.d)
      }
      return
    }
    g.hovering = true
    if (g.drag) {
      const d = g.drag
      d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y))
      if (g.flat) {
        g.pan = [d.pan[0] + e.clientX - d.x, d.pan[1] + e.clientY - d.y]
        clampPan(g)
      } else {
        const k = 180 / (Math.PI * globeR(g) * g.zoom)
        g.rot = [d.rot[0] + (e.clientX - d.x) * k, Math.max(-70, Math.min(70, d.rot[1] - (e.clientY - d.y) * k))]
        const now = performance.now()
        const dt = Math.max(1, now - d.lt)
        g.vel = [((e.clientX - d.lx) * k) / dt, (-(e.clientY - d.ly) * k) / dt]
        Object.assign(d, { lx: e.clientX, ly: e.clientY, lt: now })
      }
      g.dirty = true
      if (d.moved > 4) { setHover(null); return }
    }
    const hit = cellAt(e)
    setHover(hit.i >= 0 ? hit : null)
  }
  function up(e) {
    const g = s.current
    g.ptrs.delete(e.pointerId)
    if (g.pinch) { // the pinch ends the gesture: no pick, no drag with the finger left behind
      if (g.ptrs.size < 2) g.pinch = null
      g.drag = null
      return
    }
    const d = g.drag
    g.drag = null
    g.idleAt = performance.now()
    if (performance.now() - (d?.lt ?? 0) > 80) g.vel = [0, 0] // released after holding still: no fling
    if (d && d.moved <= 4) {
      const hit = cellAt(e)
      if (hit.i >= 0) live.current.onPick?.(g.cells[hit.i])
    }
  }
  function cancel(e) {
    const g = s.current
    g.ptrs.delete(e.pointerId)
    if (g.ptrs.size < 2) g.pinch = null
    g.drag = null
  }
  function key(e) {
    const g = s.current
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(g.zoom * 1.25); return }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomTo(g.zoom / 1.25); return }
    const turn = { ArrowLeft: [10, 0], ArrowRight: [-10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key]
    if (!turn) return
    e.preventDefault()
    if (g.flat) {
      g.pan = [g.pan[0] + turn[0] * 4, g.pan[1] - turn[1] * 4]
      clampPan(g)
    } else g.rot = [g.rot[0] + turn[0], Math.max(-70, Math.min(70, g.rot[1] + turn[1]))]
    g.idleAt = performance.now() + 10000
    g.dirty = true
  }

  const lines = hover && s.current.cells?.[hover.i] && describe ? describe(s.current.cells[hover.i]) : null
  return (
    <div ref={wrap} className="globe-canvas" style={flat ? { aspectRatio: '2 / 1', maxHeight: height } : { height }}>
      <canvas ref={cvs} role="img" aria-label={label} tabIndex={0}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
        onPointerLeave={() => { s.current.hovering = false; s.current.idleAt = performance.now(); setHover(null) }}
        onKeyDown={key}
        style={{ cursor: hover ? 'pointer' : 'grab', touchAction: zoom > 1 ? 'none' : 'pan-y' }} />
      <div className="globe-zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom in" disabled={zoom >= ZMAX} onClick={() => zoomTo(zoom * 1.5)}>+</button>
        <button type="button" aria-label="Zoom out" disabled={zoom <= ZMIN} onClick={() => zoomTo(zoom / 1.5)}>−</button>
      </div>
      {lines && (
        <div className="globe-tip" style={{ left: Math.min(hover.x + 16, (s.current.w || 0) - 300), top: hover.y + 16 }} aria-hidden="true">
          {lines.map((l, i) => <div key={i} className={i ? '' : 'head'}>{l}</div>)}
        </div>
      )}
    </div>
  )
}

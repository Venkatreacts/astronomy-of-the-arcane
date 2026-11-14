import { useEffect, useRef, useState } from 'react'
import { geoGraticule, geoInterpolate, geoOrthographic, geoPath, geoDistance } from 'd3-geo'
import { feature } from 'topojson-client'
import { api } from '../api'

// A canvas globe: each sample point is drawn as its own curved 5° patch on an orthographic Earth with
// real coastlines (served with the app, so it works offline). Colour changes sweep across the visible
// disk from west to east, so a switch of test reads as the test passing over the planet.
const SWEEP_MS = 1000 // time for the sweep to cross the disk
const CELL_MS = 650 // time for one patch to change once the sweep reaches it
const FADE_MS = 280 // plain cross-fade, used for year playback
const FLY_MS = 1400
const SPIN = 0.003 // idle rotation, degrees per ms
const RAD = Math.PI / 180
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (t) => Math.min(1, Math.max(0, t))

let landFile = null
const loadLand = () => (landFile ??= api.land().then((t) => feature(t, t.objects.land)).catch(() => null))
const graticule = geoGraticule().step([30, 30])()

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

export default function Globe({ cells, step = 5, paint, paintKey, sweep = true, sweepColor = '86,180,233',
  picked, focus, onPick, describe, height, label }) {
  const wrap = useRef(null)
  const cvs = useRef(null)
  const [hover, setHover] = useState(null)
  const s = useRef({ rot: [-50, -15], vel: [0, 0], drag: null, idleAt: -Infinity, land: null, w: 0, h: 0,
    geo: [], keys: new Map(), from: null, to: null, cur: null, t0: -Infinity, sweep: true, fly: null,
    hovering: false, visible: true, cells: null, dirty: true })
  const live = useRef({})
  live.current = { onPick, describe, picked, sweepColor }

  // geometry and colours: a new set of cells grows in from nothing; a new paint key changes from what is shown
  useEffect(() => {
    const g = s.current
    const fresh = g.cells !== cells
    if (fresh) {
      g.cells = cells
      g.geo = cells.map((c) => patch(c.lat, c.lon, step))
      g.keys = new Map(cells.map((c, i) => [`${c.lat},${c.lon}`, i]))
    }
    const to = new Float32Array(cells.length * 5)
    cells.forEach((c, i) => to.set(paint(c), i * 5))
    g.from = fresh || !g.cur ? new Float32Array(cells.length * 5) : Float32Array.from(g.cur)
    if (fresh) for (let i = 0; i < cells.length; i++) g.from.set([...to.slice(i * 5, i * 5 + 3), 0, 0.2], i * 5)
    g.to = to
    g.cur = Float32Array.from(g.from)
    g.sweep = sweep
    g.settled = false
    g.t0 = reduced() ? -Infinity : performance.now()
    g.dirty = true
  }, [cells, paintKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focus) return
    const g = s.current
    const from = [-g.rot[0], -g.rot[1]]
    const to = [focus.lon, Math.max(-60, Math.min(60, focus.lat))]
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
    loadLand().then((land) => { g.land = land; g.dirty = true })

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      g.w = wrap.current.clientWidth
      g.h = height
      canvas.width = Math.round(g.w * dpr)
      canvas.height = Math.round(g.h * dpr)
      canvas.style.width = `${g.w}px`
      canvas.style.height = `${g.h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.dirty = true
    }
    const ro = new ResizeObserver(size)
    ro.observe(wrap.current)
    const io = new IntersectionObserver(([e]) => { g.visible = e.isIntersecting })
    io.observe(canvas)
    size()

    const draw = (now) => {
      const { w, h } = g
      // a hidden or collapsed pane can report a negative size; canvas gradients reject negative radii
      const R = Math.max(0, (Math.min(w, h) / 2) * 0.9)
      const cx = w / 2
      const cy = h / 2
      const proj = geoOrthographic().translate([cx, cy]).scale(R).rotate(g.rot).clipAngle(90)
      const path = geoPath(proj, ctx)
      const center = [-g.rot[0], -g.rot[1]]
      ctx.clearRect(0, 0, w, h)

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
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill()

      ctx.beginPath(); path(graticule); ctx.strokeStyle = 'rgba(150,175,200,0.07)'; ctx.lineWidth = 1; ctx.stroke()
      if (g.land) { ctx.beginPath(); path(g.land); ctx.fillStyle = '#121d28'; ctx.fill() }

      // colours for this frame
      const n = g.geo.length
      const elapsed = now - g.t0
      const total = g.sweep ? SWEEP_MS + CELL_MS : FADE_MS
      const moving = elapsed < total
      const p = []
      for (let i = 0; i < n; i++) {
        const c = g.cells[i]
        const pc = proj([c.lon, c.lat])
        p.push(pc)
        if (!moving) continue
        const t = g.sweep ? clamp01((elapsed - ((pc[0] - (cx - R)) / (2 * R)) * SWEEP_MS) / CELL_MS) : clamp01(elapsed / FADE_MS)
        const e = ease(t)
        for (let k = 0; k < 5; k++) g.cur[i * 5 + k] = g.from[i * 5 + k] + (g.to[i * 5 + k] - g.from[i * 5 + k]) * e
      }
      if (!moving && !g.settled) { g.cur = Float32Array.from(g.to); g.settled = true }

      const limit = (90 - step / 2 - 1) * RAD
      for (let i = 0; i < n; i++) {
        const c = g.cells[i]
        const a = g.cur[i * 5 + 3]
        const sc = g.cur[i * 5 + 4]
        if (a < 0.01 || sc < 0.02 || geoDistance([c.lon, c.lat], center) > limit) continue
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

      if (g.land) { ctx.beginPath(); path(g.land); ctx.strokeStyle = 'rgba(225,235,245,0.30)'; ctx.lineWidth = 0.7; ctx.stroke() }

      const shade = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.55, cx, cy, R)
      shade.addColorStop(0, 'rgba(2,4,8,0)')
      shade.addColorStop(1, 'rgba(2,4,8,0.62)')
      ctx.fillStyle = shade
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill()
      ctx.strokeStyle = 'rgba(150,205,240,0.35)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke()

      if (g.sweep && elapsed < SWEEP_MS) {
        const x = cx - R + 2 * R * (elapsed / SWEEP_MS)
        ctx.save()
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.clip()
        const band = ctx.createLinearGradient(x - 60, 0, x + 2, 0)
        band.addColorStop(0, `rgba(${live.current.sweepColor},0)`)
        band.addColorStop(1, `rgba(${live.current.sweepColor},0.30)`)
        ctx.fillStyle = band
        ctx.fillRect(x - 60, cy - R, 62, 2 * R)
        ctx.fillStyle = `rgba(${live.current.sweepColor},0.9)`
        ctx.fillRect(x, cy - R, 1.5, 2 * R)
        ctx.restore()
      }

      const pk = live.current.picked
      if (pk && geoDistance([pk.lon, pk.lat], center) < limit) {
        ctx.beginPath()
        patch(pk.lat, pk.lon, step).forEach((pt, j) => { const [x, y] = proj(pt); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y) })
        ctx.closePath(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke()
        const [x, y] = proj([pk.lon, pk.lat])
        const t = (now % 1800) / 1800
        ctx.beginPath(); ctx.arc(x, y, (R * step * RAD) * (0.8 + 1.6 * t), 0, 2 * Math.PI)
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
      } else if (!g.drag && (Math.abs(g.vel[0]) > 0.001 || Math.abs(g.vel[1]) > 0.001)) {
        g.rot = [g.rot[0] + g.vel[0] * dt, Math.max(-70, Math.min(70, g.rot[1] + g.vel[1] * dt))]
        g.vel = g.vel.map((v) => v * Math.pow(0.94, dt / 16))
        busy = true
      } else if (!g.drag && !g.hovering && now > g.idleAt + 2500 && !reduced()) {
        g.rot = [g.rot[0] + SPIN * dt, g.rot[1]]
        busy = true
      }
      if (live.current.picked) busy = true
      if (g.visible && g.w && (busy || now - g.t0 < SWEEP_MS + CELL_MS)) {
        draw(now)
        g.dirty = false
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect() }
  }, [height, step])

  function cellAt(e) {
    const g = s.current
    const r = cvs.current.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const R = (Math.min(g.w, g.h) / 2) * 0.9
    if ((x - g.w / 2) ** 2 + (y - g.h / 2) ** 2 > R * R) return { x, y, i: -1 }
    const proj = geoOrthographic().translate([g.w / 2, g.h / 2]).scale(R).rotate(g.rot)
    const [lon, lat] = proj.invert([x, y])
    const i = g.keys.get(`${snap(lat, step)},${snap(lon, step)}`)
    return { x, y, i: i ?? -1 }
  }

  function down(e) {
    const g = s.current
    g.drag = { x: e.clientX, y: e.clientY, rot: [...g.rot], moved: 0, lx: e.clientX, ly: e.clientY, lt: performance.now() }
    g.vel = [0, 0]
    g.fly = null
    cvs.current.setPointerCapture?.(e.pointerId)
  }
  function move(e) {
    const g = s.current
    g.hovering = true
    if (g.drag) {
      const R = (Math.min(g.w, g.h) / 2) * 0.9
      const k = 180 / (Math.PI * R)
      const d = g.drag
      d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y))
      g.rot = [d.rot[0] + (e.clientX - d.x) * k, Math.max(-70, Math.min(70, d.rot[1] - (e.clientY - d.y) * k))]
      const now = performance.now()
      const dt = Math.max(1, now - d.lt)
      g.vel = [((e.clientX - d.lx) * k) / dt, (-(e.clientY - d.ly) * k) / dt]
      Object.assign(d, { lx: e.clientX, ly: e.clientY, lt: now })
      g.dirty = true
      if (d.moved > 4) { setHover(null); return }
    }
    const hit = cellAt(e)
    setHover(hit.i >= 0 ? hit : null)
  }
  function up(e) {
    const g = s.current
    const d = g.drag
    g.drag = null
    g.idleAt = performance.now()
    if (performance.now() - (d?.lt ?? 0) > 80) g.vel = [0, 0] // released after holding still: no fling
    if (d && d.moved <= 4) {
      const hit = cellAt(e)
      if (hit.i >= 0) live.current.onPick?.(g.cells[hit.i])
    }
  }
  function key(e) {
    const g = s.current
    const turn = { ArrowLeft: [10, 0], ArrowRight: [-10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key]
    if (!turn) return
    e.preventDefault()
    g.rot = [g.rot[0] + turn[0], Math.max(-70, Math.min(70, g.rot[1] + turn[1]))]
    g.idleAt = performance.now() + 10000
    g.dirty = true
  }

  const lines = hover && s.current.cells?.[hover.i] && describe ? describe(s.current.cells[hover.i]) : null
  return (
    <div ref={wrap} className="globe-canvas" style={{ height }}>
      <canvas ref={cvs} role="img" aria-label={label} tabIndex={0}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onPointerCancel={() => { s.current.drag = null }}
        onPointerLeave={() => { s.current.hovering = false; s.current.idleAt = performance.now(); setHover(null) }}
        onKeyDown={key}
        style={{ cursor: hover ? 'pointer' : 'grab' }} />
      {lines && (
        <div className="globe-tip" style={{ left: Math.min(hover.x + 16, (s.current.w || 0) - 300), top: hover.y + 16 }} aria-hidden="true">
          {lines.map((l, i) => <div key={i} className={i ? '' : 'head'}>{l}</div>)}
        </div>
      )}
    </div>
  )
}

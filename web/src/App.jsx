import { useEffect, useState } from 'react'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow-semi-condensed/600.css'
import '@fontsource/barlow-semi-condensed/700.css'
import AtlasView from './views/AtlasView'
import NoiseTrapView from './views/NoiseTrapView'
import InvestigateView from './views/InvestigateView'
import CasesView from './views/CasesView'
import ScanView from './views/ScanView'
import DetectiveView from './views/DetectiveView'
import WhoView from './views/WhoView'
import StartView from './views/StartView'
import HeadlineView from './views/HeadlineView'
import './App.css'

const PLATES = [
  ['atlas', 'The planet'],
  ['who', 'Who it’s for'],
  ['trap', 'The trap'],
  ['start', 'Start here'],
  ['headline', 'Check a headline'],
  ['place', 'Your place'],
  ['scan', 'Scan a region'],
  ['detective', 'Ask the detective'],
  ['method', 'Method'],
]

export default function App() {
  const [pick, setPick] = useState(null)
  // the sections render after load, so the browser misses a #section link; follow the target while
  // plots and data files grow the page above it, then let go
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) return
    const ro = new ResizeObserver(() => document.getElementById(id)?.scrollIntoView({ behavior: 'instant' }))
    ro.observe(document.body)
    const stop = () => ro.disconnect()
    const t = setTimeout(stop, 4000)
    window.addEventListener('wheel', stop, { once: true })
    window.addEventListener('touchstart', stop, { once: true })
    return () => { clearTimeout(t); stop() }
  }, [])
  return (
    <>
      <header className="bar">
        <a className="mark" href="#atlas">Noise Trap</a>
        <nav aria-label="Sections">
          {PLATES.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>
      </header>
      <main>
        <section id="atlas" className="plate hero"><AtlasView onPick={(p) => {
          setPick({ ...p, at: Date.now() })
          document.getElementById('place')?.scrollIntoView({ behavior: 'smooth' })
        }} /></section>
        <section id="who" className="plate"><WhoView /></section>
        <section id="trap" className="plate"><NoiseTrapView /></section>
        <section id="start" className="plate"><StartView /></section>
        <section id="headline" className="plate"><HeadlineView /></section>
        <section id="place" className="plate"><InvestigateView pick={pick} /><CasesView /></section>
        <section id="scan" className="plate"><ScanView /></section>
        <section id="detective" className="plate"><DetectiveView /></section>
        <section id="method" className="plate method">
          <h2>How we know the honest verdict is honest</h2>
          <div className="cols">
            <p>
              We make fake Earth data where the truth is known (the lab above). On 45 years of pure noise as sticky as
              real monthly weather (φ = 0.5), the usual Mann-Kendall test flags 22% of places (15–30% across 10 maps).
              Removing the stickiness first (pre-whitening, Kulkarni &amp; von Storch 1995) brings that to 3%, and
              false-discovery control to 0%.
            </p>
            <p>
              Plant a real trend in half the map and all three methods find all of it up to φ = 0.7. The honest verdict
              then also flags about 7% of the empty half, so roughly 1 in 15 of its flags is wrong: inside the 10% false
              discovery rate it promises. The 95% range on a rate held the true rate 93–98% of the time, with or
              without 30% of months missing.
            </p>
            <p>
              Data: NASA POWER (MERRA-2) monthly values, 1981–2025. The atlas samples one point every 5°; maps test
              thousands of places at once, so we control the false discovery rate at 10% (Benjamini-Hochberg; Wilks
              2016). Region clusters must beat the largest patch on 199 time-shuffled maps of all five variables.
              Full numbers are in docs/validation.md.
            </p>
          </div>
          <p className="credit">Team Astronomy of the Arcane · NASA Space Apps Challenge 2026 · Be An Earth System Trend Detective!</p>
        </section>
      </main>
    </>
  )
}

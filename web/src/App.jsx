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
import './App.css'

const PLATES = [
  ['atlas', 'The planet'],
  ['trap', 'The trap'],
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
        <section id="trap" className="plate"><NoiseTrapView /></section>
        <section id="place" className="plate"><InvestigateView pick={pick} /><CasesView /></section>
        <section id="scan" className="plate"><ScanView /></section>
        <section id="detective" className="plate"><DetectiveView /></section>
        <section id="method" className="plate method">
          <h2>How we know the honest test is honest</h2>
          <div className="cols">
            <p>
              We make fake Earth data where we know the truth. On pure noise as sticky as real monthly weather
              (φ = 0.5), the usual Mann-Kendall test calls 21% of the map a trend. The pre-whitened test
              (Kulkarni &amp; von Storch 1995) calls 0% after false-discovery control, and about 5% before it,
              which is what a 5% test should do.
            </p>
            <p>
              Plant a real trend in half the map and the honest test still finds all of it while staying near 5%
              on the empty half, up to φ = 0.7. Stickier data needs a longer record, and the site says so.
              The 95% range on each rate contained the true value 95% of the time in 300 simulated series.
            </p>
            <p>
              Data: NASA POWER (MERRA-2) monthly values, 1981–2025. Maps test thousands of places at once, so
              we control the false discovery rate at 10% (Benjamini-Hochberg; Wilks 2016). Region clusters must
              beat 199 time-shuffles. Full numbers are in docs/validation.md.
            </p>
          </div>
          <p className="credit">Team Astronomy of the Arcane · NASA Space Apps Challenge 2026 · Be An Earth System Trend Detective!</p>
        </section>
      </main>
    </>
  )
}

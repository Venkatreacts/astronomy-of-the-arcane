import { useState } from 'react'
import NoiseTrapView from './views/NoiseTrapView'
import InvestigateView from './views/InvestigateView'
import CasesView from './views/CasesView'
import ScanView from './views/ScanView'
import DetectiveView from './views/DetectiveView'
import './App.css'

const TABS = [
  { id: 'trap', label: 'Noise Trap', view: NoiseTrapView },
  { id: 'scan', label: 'Scan a region', view: ScanView },
  { id: 'detective', label: 'AI Detective', view: DetectiveView },
  { id: 'investigate', label: 'Investigate a place', view: InvestigateView },
  { id: 'cases', label: 'Case files', view: CasesView },
]

export default function App() {
  const [tab, setTab] = useState('trap')
  const View = TABS.find((t) => t.id === tab).view
  return (
    <div className="app">
      <header>
        <h1>Noise Trap</h1>
        <p className="tagline">The trend detective that can't be fooled. Built on NASA Earth data.</p>
        <nav role="tablist" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id}
              className={tab === t.id ? 'tab on' : 'tab'} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        <View />
      </main>
      <footer>
        Team Astronomy of the Arcane · NASA Space Apps Challenge 2026 · Challenge: Be An Earth System Trend Detective!
      </footer>
    </div>
  )
}

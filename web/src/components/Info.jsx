// A small "i" beside a statistical word; it opens the two-sentence definition from lib/glossary.json.
import { useEffect, useId, useRef, useState } from 'react'
import GLOSSARY from '../lib/glossary.json'

export default function Info({ term }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const id = useId()
  const text = GLOSSARY[term]
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [open])
  if (!text) return null
  return (
    <span className="info" ref={ref}>
      <button type="button" className="info-btn" aria-expanded={open} aria-controls={id}
        aria-label={`What does “${term}” mean?`} onClick={() => setOpen(!open)}>i</button>
      {open && <span id={id} role="note" className="info-pop"><b>{term}</b> {text}</span>}
    </span>
  )
}

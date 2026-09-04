// src/components/DateInput.jsx
//
// Custom replacement for native <input type="date">.
// Native date inputs delegate segment auto-advance (year -> month -> day)
// entirely to the browser's internal UI — there is no JS/React API to
// control or force it, which is why that behavior can silently break after
// a browser update with no app-code change involved. This component
// implements auto-advance ourselves so it's fully controlled and consistent.

import { useEffect, useRef, useState } from 'react'

function pad(n, len) {
  return String(n).padStart(len, '0')
}

function parseIso(iso) {
  if (!iso) return { y: '', m: '', d: '' }
  const [y, m, d] = iso.split('-')
  return { y: y || '', m: m || '', d: d || '' }
}

export default function DateInput({ value, onChange, required = false, className = '' }) {
  const [parts, setParts] = useState(() => parseIso(value))
  const yearRef  = useRef(null)
  const monthRef = useRef(null)
  const dayRef   = useRef(null)

  // Stay in sync if the parent updates value externally
  // (e.g. draft restore from localStorage, or a computed default).
  useEffect(() => {
    setParts(parseIso(value))
  }, [value])

  function emit(next) {
    const { y, m, d } = next
    if (y.length === 4 && m.length > 0 && d.length > 0) {
      const mm = pad(Math.min(Math.max(parseInt(m, 10) || 1, 1), 12), 2)
      const dd = pad(Math.min(Math.max(parseInt(d, 10) || 1, 1), 31), 2)
      onChange(`${y}-${mm}-${dd}`)
    } else if (y === '' && m === '' && d === '') {
      onChange('')
    }
  }

  function handleYear(e) {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
    const next = { ...parts, y: v }
    setParts(next)
    emit(next)
    if (v.length === 4) monthRef.current?.focus()
  }

  function handleMonth(e) {
    const v = e.target.value.replace(/\D/g, '').slice(0, 2)
    const next = { ...parts, m: v }
    setParts(next)
    emit(next)
    if (v.length === 2) dayRef.current?.focus()
  }

  function handleDay(e) {
    const v = e.target.value.replace(/\D/g, '').slice(0, 2)
    const next = { ...parts, d: v }
    setParts(next)
    emit(next)
  }

  function handleMonthKeyDown(e) {
    if (e.key === 'Backspace' && parts.m === '') yearRef.current?.focus()
  }
  function handleDayKeyDown(e) {
    if (e.key === 'Backspace' && parts.d === '') monthRef.current?.focus()
  }

  return (
    <div className={`flex items-center gap-1 p-2 border rounded-lg text-sm bg-white ${className}`}>
      <input
        ref={yearRef}
        type="text"
        inputMode="numeric"
        placeholder="yyyy"
        value={parts.y}
        onChange={handleYear}
        required={required}
        className="w-12 outline-none bg-transparent"
      />
      <span className="text-gray-300">-</span>
      <input
        ref={monthRef}
        type="text"
        inputMode="numeric"
        placeholder="mm"
        value={parts.m}
        onChange={handleMonth}
        onKeyDown={handleMonthKeyDown}
        className="w-8 outline-none bg-transparent"
      />
      <span className="text-gray-300">-</span>
      <input
        ref={dayRef}
        type="text"
        inputMode="numeric"
        placeholder="dd"
        value={parts.d}
        onChange={handleDay}
        onKeyDown={handleDayKeyDown}
        className="w-8 outline-none bg-transparent"
      />
    </div>
  )
}
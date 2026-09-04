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

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max)
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
  // This only fires when the parent's value actually changes, which only
  // happens once a full date has been emitted below — so it never clobbers
  // a field the user is still mid-typing.
  useEffect(() => {
    setParts(parseIso(value))
  }, [value])

  // Only pushes a value up (and pads) once year/month/day all have their
  // full digit count, unless `force` is set (used on blur to finalize a
  // single leftover digit, e.g. "3" -> "03").
  function emit(next, { force = false } = {}) {
    const { y, m, d } = next
    const yComplete = y.length === 4
    const mComplete = force ? m.length > 0 : m.length === 2
    const dComplete = force ? d.length > 0 : d.length === 2
    if (yComplete && mComplete && dComplete) {
      const mm = pad(clamp(parseInt(m, 10) || 1, 1, 12), 2)
      const dd = pad(clamp(parseInt(d, 10) || 1, 1, 31), 2)
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

  // Finalize a lone leftover digit if the user tabs/clicks away
  // before typing a second one (e.g. types "3" for day, then blurs).
  function handleMonthBlur() {
    if (parts.m.length === 1) emit(parts, { force: true })
  }
  function handleDayBlur() {
    if (parts.d.length === 1) emit(parts, { force: true })
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
        onBlur={handleMonthBlur}
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
        onBlur={handleDayBlur}
        className="w-8 outline-none bg-transparent"
      />
    </div>
  )
}

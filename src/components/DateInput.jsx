// src/components/DateInput.jsx
//
// Custom replacement for native <input type="date">.
// Native date inputs delegate segment auto-advance (year -> month -> day)
// entirely to the browser's internal UI — there is no JS/React API to
// control or force it, which is why that behavior can silently break after
// a browser update with no app-code change involved. This component
// implements auto-advance ourselves so typing is fully controlled, and adds
// its own calendar-popup so clicking still works the way the native picker
// did.

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

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function daysInMonth(year, month) {
  // month is 1-12
  return new Date(year, month, 0).getDate()
}

// Builds a 6-week grid for the given year/month (month is 1-12), including
// grayed-out padding days from the previous/next month, matching the native
// picker's layout.
function buildGrid(year, month) {
  const firstOfMonth = new Date(year, month - 1, 1)
  const startOffset = firstOfMonth.getDay() // 0 = Sunday
  const totalDays = daysInMonth(year, month)
  const prevMonthDays = daysInMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)

  const cells = []
  for (let i = 0; i < startOffset; i++) {
    const day = prevMonthDays - startOffset + 1 + i
    const m = month === 1 ? 12 : month - 1
    const y = month === 1 ? year - 1 : year
    cells.push({ day, month: m, year: y, inMonth: false })
  }
  for (let day = 1; day <= totalDays; day++) {
    cells.push({ day, month, year, inMonth: true })
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1]
    const nextDay = last.day + 1
    const overflowsMonth = nextDay > daysInMonth(last.year, last.month)
    if (overflowsMonth) {
      const m = last.month === 12 ? 1 : last.month + 1
      const y = last.month === 12 ? last.year + 1 : last.year
      cells.push({ day: 1, month: m, year: y, inMonth: false })
    } else {
      cells.push({ day: nextDay, month: last.month, year: last.year, inMonth: false })
    }
    if (cells.length >= 42) break
  }

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export default function DateInput({ value, onChange, required = false, className = '' }) {
  const [parts, setParts] = useState(() => parseIso(value))
  const [showCalendar, setShowCalendar] = useState(false)
  const [view, setView] = useState(() => {
    const p = parseIso(value)
    const today = new Date()
    return {
      year: p.y ? parseInt(p.y, 10) : today.getFullYear(),
      month: p.m ? parseInt(p.m, 10) : today.getMonth() + 1,
    }
  })

  const yearRef  = useRef(null)
  const monthRef = useRef(null)
  const dayRef   = useRef(null)
  const containerRef = useRef(null)

  // Stay in sync if the parent updates value externally
  // (e.g. draft restore from localStorage, or a computed default).
  // This only fires when the parent's value actually changes, which only
  // happens once a full date has been emitted below — so it never clobbers
  // a field the user is still mid-typing.
  useEffect(() => {
    setParts(parseIso(value))
  }, [value])

  // Close the calendar popup on outside click.
  useEffect(() => {
    if (!showCalendar) return
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowCalendar(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showCalendar])

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

  function openCalendar() {
    const today = new Date()
    setView({
      year: parts.y ? parseInt(parts.y, 10) : today.getFullYear(),
      month: parts.m ? parseInt(parts.m, 10) : today.getMonth() + 1,
    })
    setShowCalendar(true)
  }

  function goToPrevMonth() {
    setView(v => v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 })
  }
  function goToNextMonth() {
    setView(v => v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 })
  }

  function selectDay(cell) {
    const next = { y: String(cell.year), m: pad(cell.month, 2), d: pad(cell.day, 2) }
    setParts(next)
    emit(next, { force: true })
    setShowCalendar(false)
  }

  function selectToday() {
    const today = new Date()
    selectDay({ year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() })
  }

  function clearDate() {
    const next = { y: '', m: '', d: '' }
    setParts(next)
    onChange('')
    setShowCalendar(false)
  }

  const grid = buildGrid(view.year, view.month)
  const selectedY = parts.y ? parseInt(parts.y, 10) : null
  const selectedM = parts.m ? parseInt(parts.m, 10) : null
  const selectedD = parts.d ? parseInt(parts.d, 10) : null

  return (
    <div className="relative" ref={containerRef}>
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
        <button
          type="button"
          onClick={() => (showCalendar ? setShowCalendar(false) : openCalendar())}
          className="ml-auto text-gray-400 hover:text-gray-600"
          aria-label="Open calendar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
      </div>

      {showCalendar && (
        <div className="absolute z-50 mt-1 w-72 bg-white border rounded-lg shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm">{MONTH_NAMES[view.month - 1]}, {view.year}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={goToPrevMonth} className="text-gray-500 hover:text-gray-800" aria-label="Previous month">▲</button>
              <button type="button" onClick={goToNextMonth} className="text-gray-500 hover:text-gray-800" aria-label="Next month">▼</button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-xs text-gray-400 mb-1">
            {WEEKDAYS.map(w => <span key={w} className="text-center py-1">{w}</span>)}
          </div>

          {grid.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((cell, ci) => {
                const isSelected = cell.inMonth && cell.year === selectedY && cell.month === selectedM && cell.day === selectedD
                return (
                  <button
                    type="button"
                    key={ci}
                    onClick={() => selectDay(cell)}
                    className={
                      `text-sm py-1 rounded ` +
                      (isSelected
                        ? 'bg-blue-600 text-white'
                        : cell.inMonth
                          ? 'text-gray-800 hover:bg-gray-100'
                          : 'text-gray-300 hover:bg-gray-50')
                    }
                  >
                    {cell.day}
                  </button>
                )
              })}
            </div>
          ))}

          <div className="flex items-center justify-between mt-2 pt-2 border-t text-sm">
            <button type="button" onClick={clearDate} className="text-blue-600 hover:underline">Clear</button>
            <button type="button" onClick={selectToday} className="text-blue-600 hover:underline">Today</button>
          </div>
        </div>
      )}
    </div>
  )
}

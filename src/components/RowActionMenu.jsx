// src/components/RowActionMenu.jsx

import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Row "..." menu that renders in a portal so table overflow can't clip it.
 * Flips upward when there isn't enough room below the button.
 *
 * Usage:
 *   <RowActionMenu>
 *     {({ close }) => (
 *       <>
 *         <button onClick={() => { close(); handleView(inv) }}>View</button>
 *         ...
 *       </>
 *     )}
 *   </RowActionMenu>
 */
export default function RowActionMenu({ children, buttonClassName = '', menuClassName = '' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: -9999, left: -9999 })
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  const close = () => setOpen(false)

  const place = () => {
    const btn = btnRef.current
    const menu = menuRef.current
    if (!btn || !menu) return
    const r = btn.getBoundingClientRect()
    const mh = menu.offsetHeight
    const mw = menu.offsetWidth
    const gap = 4
    const spaceBelow = window.innerHeight - r.bottom
    const flipUp = spaceBelow < mh + gap && r.top > mh + gap
    const top = flipUp ? r.top - mh - gap : r.bottom + gap
    const left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8))
    setPos({ top, left })
  }

  // Measure after the menu renders, before paint (no flicker)
  useLayoutEffect(() => {
    if (open) place()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      close()
    }
    const onKey = (e) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true) // capture: catches scrolling in any ancestor
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={buttonClassName}
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000 }}
            className={
              menuClassName ||
              'min-w-[200px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg'
            }
          >
            {typeof children === 'function' ? children({ close }) : children}
          </div>,
          document.body
        )}
    </>
  )
}
// src/components/RichTextNotes.jsx
//
// A minimal rich-text field for invoice Notes: Bold, Italic, and a small
// color palette. Stores content as sanitized HTML (only <b>, <i>, <span
// style="color:...">, <br>, <div> survive) — exportInvoicePDF.js parses
// that same HTML to render styled text in the PDF. Plain text in/out still
// works fine for invoices saved before this existed.

import { useEffect, useRef, useState } from 'react'

const COLORS = [
  { name: 'Default', value: '#1e293b' },
  { name: 'Red',      value: '#dc2626' },
  { name: 'Teal',     value: '#0d7477' },
  { name: 'Blue',     value: '#2563eb' },
  { name: 'Green',    value: '#16a34a' },
]

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'SPAN', 'BR', 'DIV', 'P'])

function sanitize(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')

  function clean(node) {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType !== Node.ELEMENT_NODE) return

      if (!ALLOWED_TAGS.has(child.tagName)) {
        // Unwrap disallowed elements — keep their text/children, drop the tag.
        while (child.firstChild) node.insertBefore(child.firstChild, child)
        node.removeChild(child)
        return
      }

      // Strip every attribute except a color-only style on <span>.
      const color = child.tagName === 'SPAN' ? child.style?.color : null
      Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name))
      if (color) child.style.color = color

      clean(child)
    })
  }

  clean(parsed.body)
  return parsed.body.innerHTML
}

function isEmpty(html) {
  if (!html) return true
  const text = html.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').trim()
  return text === ''
}

export default function RichTextNotes({ value, onChange, placeholder }) {
  const ref = useRef(null)
  const [focused, setFocused] = useState(false)

  // Keep the DOM in sync with external value changes (e.g. draft restore),
  // without clobbering the cursor while the user is actively typing.
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value || ''
    }
  }, [value])

  function exec(command, arg) {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    handleInput()
  }

  function handleInput() {
    if (!ref.current) return
    onChange(sanitize(ref.current.innerHTML))
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-1 p-2 border-b bg-gray-50">
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => exec('bold')}
          className="w-7 h-7 text-sm font-bold border rounded hover:bg-gray-200"
        >B</button>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => exec('italic')}
          className="w-7 h-7 text-sm italic border rounded hover:bg-gray-200"
        >I</button>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        {COLORS.map(c => (
          <button
            key={c.name}
            type="button"
            title={c.name}
            onMouseDown={e => e.preventDefault()}
            onClick={() => exec('foreColor', c.value)}
            className="w-5 h-5 rounded-full border border-gray-300"
            style={{ backgroundColor: c.value }}
          />
        ))}
      </div>

      <div className="relative">
        {!focused && isEmpty(value) && (
          <span className="absolute top-3 left-3 text-sm text-gray-400 pointer-events-none">
            {placeholder}
          </span>
        )}
        <div
          ref={ref}
          contentEditable
          onInput={handleInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full p-3 text-sm min-h-[6rem] outline-none"
        />
      </div>
    </div>
  )
}

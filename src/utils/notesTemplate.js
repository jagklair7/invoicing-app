// src/utils/notesTemplate.js

// Resolves a customer's default-notes template, falling back to the
// management-company (parent) template if the customer has none of its
// own, then substitutes {{customer_name}} with the customer's own name.
export function resolveDefaultNotes(customer, allCustomers) {
  if (!customer) return ''
  const parent = allCustomers.find(c => c.id === customer.parent_customer_id)
  const template = customer.default_notes || parent?.default_notes || ''
  if (!template) return ''
  return template.replace(/\{\{\s*customer_name\s*\}\}/g, customer.name || '')
}

// RichTextNotes stores HTML, but default_notes is authored as plain text
// with line breaks in the Customers form — convert one to the other.
export function textTemplateToHtml(text) {
  if (!text) return ''
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('')
}

// Treats markup-only content (e.g. '<p><br></p>') as empty too, so we can
// tell "truly blank" apart from "user already typed/restored something".
export function isNotesEmpty(html) {
  if (!html) return true
  return html.replace(/<[^>]*>/g, '').trim().length === 0
}
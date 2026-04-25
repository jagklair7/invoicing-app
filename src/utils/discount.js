// src/utils/discount.js
export function calcLineTotal(item) {
  const subtotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
  if (item.discount_type === 'percent') {
    return subtotal * (1 - (Number(item.discount_value) || 0) / 100)
  }
  if (item.discount_type === 'fixed') {
    return Math.max(0, subtotal - (Number(item.discount_value) || 0))
  }
  return subtotal
}

export function calcLineDiscount(item) {
  const subtotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
  if (item.discount_type === 'percent') {
    return subtotal * ((Number(item.discount_value) || 0) / 100)
  }
  if (item.discount_type === 'fixed') {
    return Math.min(subtotal, Number(item.discount_value) || 0)
  }
  return 0
}
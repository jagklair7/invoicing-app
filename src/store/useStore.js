// src/store/useStore.js
import { create } from 'zustand'

export const useStore = create((set) => ({
  customers: [],
  invoices: [],

  setCustomers: (customers) => set({ customers }),
  setInvoices: (invoices) => set({ invoices }),
}))
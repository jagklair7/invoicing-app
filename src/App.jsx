// src/App.jsx
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './app/supabaseClient'

// Pages & Components
import Layout from './components/Layout'
import InvoiceForm from './pages/InvoiceForm.jsx'
import InvoiceView from './pages/InvoiceView.jsx'
import Customers from './pages/Customers'
import Invoices from './pages/Invoices'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Settings from './pages/Settings.jsx'
import Dashboard from './pages/Dashboard.jsx'
import CustomerStatement from './pages/CustomerStatement.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return <div className="loading-screen">Loading Klair Invoicing...</div>

  return (
    <Layout>
      <Routes>
        {/* Public Route */}
        <Route
          path="/login"
          element={!session ? <Login /> : <Navigate to="/" />}
        />
        <Route
          path="/signup"
          element={!session ? <Signup /> : <Navigate to="/" />}
        />

        {/* Protected Routes */}
        <Route path="/"               element={session ? <Dashboard />   : <Navigate to="/login" />} />
        <Route path="/customers"      element={session ? <Customers />    : <Navigate to="/login" />} />
        <Route path="/invoices"       element={session ? <Invoices />     : <Navigate to="/login" />} />
        <Route path="/invoices/new"   element={session ? <InvoiceForm />  : <Navigate to="/login" />} />
        <Route path="/invoices/:id"   element={session ? <InvoiceView />  : <Navigate to="/login" />} />
        <Route path="/settings"       element={session ? <Settings />     : <Navigate to="/login" />} />
        <Route
          path="/customers/:id/statement"
          element={session ? <CustomerStatement /> : <Navigate to="/login" />}
        />
        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}
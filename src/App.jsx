// src/App.jsx
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './app/supabaseClient'
import ProductsPage from './pages/ProductsPage'


// Pages & Components
import Layout        from './components/Layout'
import InvoiceForm   from './pages/InvoiceForm.jsx'
import InvoiceView   from './pages/InvoiceView.jsx'
import Customers     from './pages/Customers'
import Invoices      from './pages/Invoices'
import Login         from './pages/Login.jsx'
import Signup        from './pages/Signup.jsx'
import AuthCallback  from './pages/AuthCallback.jsx'
import Settings      from './pages/Settings.jsx'
import Dashboard     from './pages/Dashboard.jsx'
import CustomerStatement from './pages/CustomerStatement.jsx'
import { OrgProvider } from './context/OrgContext'
import OrgSwitcher from './components/OrgSwitcher.jsx'
import CreateOrganization from './pages/CreateOrganization.jsx'
import Organizations from './pages/admin/Organizations.jsx'

function ProtectedRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return children
}

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

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', fontFamily: 'DM Sans, sans-serif',
      fontSize: 14, color: '#94a3b8', background: '#f8fafc'
    }}>
      Loading…
    </div>
  )

  return (
      <OrgProvider>
        <Layout session={session}>
          <Routes>
            {/* Public */}
            <Route path="/login"  element={!session ? <Login />  : <Navigate to="/" replace />} />
            <Route path="/signup" element={!session ? <Signup /> : <Navigate to="/" replace />} />

            {/* Protected */}
            <Route path="/" element={
              <ProtectedRoute session={session}><Dashboard /></ProtectedRoute>
            } />
            <Route path="/customers" element={
              <ProtectedRoute session={session}><Customers /></ProtectedRoute>
            } />
            <Route path="/invoices" element={
              <ProtectedRoute session={session}><Invoices /></ProtectedRoute>
            } />
            <Route path="/invoices/new" element={
              <ProtectedRoute session={session}><InvoiceForm /></ProtectedRoute>
            } />
            <Route path="/invoices/:id" element={
              <ProtectedRoute session={session}><InvoiceView /></ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute session={session}><Settings /></ProtectedRoute>
            } />
            <Route path="/customers/:id/statement" element={
              <ProtectedRoute session={session}><CustomerStatement /></ProtectedRoute>
            } />
            <Route path="/org-switcher" element={
              <ProtectedRoute session={session}><OrgSwitcher /></ProtectedRoute>
            } />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/create-org" element={<CreateOrganization />} />
            <Route path="/organizations" element={<Organizations />} />
            <Route path="/admin/organizations" element={<Organizations />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
    </OrgProvider>
  )
}
// src/App.jsx
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './app/supabaseClient'

// Pages & Components
import Layout            from './components/Layout'
import InvoiceForm       from './pages/InvoiceForm.jsx'
import InvoiceView       from './pages/InvoiceView.jsx'
import Customers         from './pages/Customers'
import Invoices          from './pages/Invoices'
import Login             from './pages/Login.jsx'
import Signup            from './pages/Signup.jsx'
import AuthCallback      from './pages/AuthCallback.jsx'
import Settings          from './pages/Settings.jsx'
import Dashboard         from './pages/Dashboard.jsx'
import ProductsPage      from './pages/ProductsPage'
import Employees         from './pages/Employees.jsx'
import Payroll           from './pages/Payroll.jsx'
import CustomerStatement from './pages/CustomerStatement.jsx'
import CreateOrganization from './pages/CreateOrganization.jsx'
import Onboarding        from './pages/Onboarding.jsx'
import AdminPanel        from './pages/admin/AdminPanel.jsx'
import GlobalAnalytics   from './pages/admin/GlobalAnalytics.jsx'
import Organizations     from './pages/admin/Organizations.jsx'
import SeedPlans         from './pages/admin/SeedPlans.jsx'
import { OrgProvider, useOrg } from './context/OrgContext'
import OrgSwitcher       from './components/OrgSwitcher.jsx'
import Estimates         from './pages/Estimates.jsx'
import EstimateForm      from './pages/EstimateForm.jsx'
import EstimateView      from './pages/EstimateView.jsx'

import Quotes      from "./pages/Quotes";
import QuoteForm   from "./pages/QuoteForm";
import QuoteView   from "./pages/QuoteView";
import QuotePublic from "./pages/QuotePublic";

import Vendors           from './pages/Vendors.jsx'
import PurchaseOrders    from './pages/PurchaseOrders.jsx'
import PurchaseOrderView from './pages/PurchaseOrderView.jsx'

// ── Guards ────────────────────────────────────────────────────────────────────

function ProtectedRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return children
}

// Redirects to /onboarding if user has no org yet
function OrgGuard({ session, children }) {
  const { orgs, loading } = useOrg()
  if (!session) return <Navigate to="/login" replace />
  if (loading) return null
  if (!orgs.length) return <Navigate to="/onboarding" replace />
  return children
}

// Only accessible if is_super_admin
function SuperAdminRoute({ session, children }) {
  const { isSuperAdmin, loading } = useOrg()
  if (!session) return <Navigate to="/login" replace />
  if (loading) return null
  if (!isSuperAdmin) return <Navigate to="/" replace />
  return children
}

// ── App ───────────────────────────────────────────────────────────────────────

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
      <Routes>
        {/* ── Fully public, no Layout/shell at all ──────────────────── */}
        <Route path="/q/:token" element={<QuotePublic />} />

        {/* ── Everything else lives inside the app shell ────────────── */}
        <Route path="/*" element={
          <Layout session={session}>
            <Routes>
              <Route path="/login"         element={!session ? <Login />  : <Navigate to="/" replace />} />
              <Route path="/signup"        element={!session ? <Signup /> : <Navigate to="/" replace />} />
              <Route path="/auth/callback" element={<AuthCallback />} />

              <Route path="/onboarding" element={
                session ? <Onboarding /> : <Navigate to="/login" replace />
              } />

              <Route path="/create-org" element={
                <ProtectedRoute session={session}><CreateOrganization /></ProtectedRoute>
              } />

              <Route path="/admin" element={
                <SuperAdminRoute session={session}><AdminPanel /></SuperAdminRoute>
              } />
              <Route path="/admin/analytics" element={
                <SuperAdminRoute session={session}><GlobalAnalytics /></SuperAdminRoute>
              } />
              <Route path="/admin/seed-plans" element={
                <SuperAdminRoute session={session}><SeedPlans /></SuperAdminRoute>
              } />
              <Route path="/admin/*" element={
                <SuperAdminRoute session={session}><AdminPanel /></SuperAdminRoute>
              } />

              <Route path="/" element={
                <OrgGuard session={session}><Dashboard /></OrgGuard>
              } />
              <Route path="/customers" element={
                <OrgGuard session={session}><Customers /></OrgGuard>
              } />
              <Route path="/customers/:id/statement" element={
                <OrgGuard session={session}><CustomerStatement /></OrgGuard>
              } />
              <Route path="/invoices" element={
                <OrgGuard session={session}><Invoices /></OrgGuard>
              } />
              <Route path="/invoices/new" element={
                <OrgGuard session={session}><InvoiceForm /></OrgGuard>
              } />
              <Route path="/invoices/:id" element={
                <OrgGuard session={session}><InvoiceView /></OrgGuard>
              } />

              <Route path="/vendors" element={
                <OrgGuard session={session}><Vendors /></OrgGuard>
              } />
              <Route path="/purchase-orders" element={
                <OrgGuard session={session}><PurchaseOrders /></OrgGuard>
              } />
              <Route path="/purchase-orders/:id" element={
                <OrgGuard session={session}><PurchaseOrderView /></OrgGuard>
              } />

              <Route path="/estimates" element={
                <OrgGuard session={session}><Estimates /></OrgGuard>
              } />
              <Route path="/estimates/new" element={
                <OrgGuard session={session}><EstimateForm /></OrgGuard>
              } />
              <Route path="/estimates/:id" element={
                <OrgGuard session={session}><EstimateView /></OrgGuard>
              } />
              <Route path="/estimates/:id/edit" element={
                <OrgGuard session={session}><EstimateForm /></OrgGuard>
              } />

              <Route path="/settings" element={
                <OrgGuard session={session}><Settings /></OrgGuard>
              } />
              <Route path="/products" element={
                <OrgGuard session={session}><ProductsPage /></OrgGuard>
              } />
              <Route path="/employees" element={
                <OrgGuard session={session}><Employees /></OrgGuard>
              } />
              <Route path="/payroll" element={
                <OrgGuard session={session}><Payroll /></OrgGuard>
              } />
              <Route path="/organizations" element={
                <SuperAdminRoute session={session}><Organizations /></SuperAdminRoute>
              } />

              <Route path="/quotes"          element={<OrgGuard session={session}><Quotes /></OrgGuard>} />
              <Route path="/quotes/new"      element={<OrgGuard session={session}><QuoteForm /></OrgGuard>} />
              <Route path="/quotes/:id"      element={<OrgGuard session={session}><QuoteView /></OrgGuard>} />
              <Route path="/quotes/:id/edit" element={<OrgGuard session={session}><QuoteForm /></OrgGuard>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        } />
      </Routes>
    </OrgProvider>
  )
}
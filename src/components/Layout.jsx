//src/components/Layout.jsx
import { NavLink } from 'react-router-dom'

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r p-4">
        <h1 className="text-xl font-bold mb-6">
          Invoice App
        </h1>

        <nav className="flex flex-col gap-2 text-sm">

          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive ? "font-semibold text-black" : "text-gray-500"
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/customers"
            className={({ isActive }) =>
              isActive ? "font-semibold text-black" : "text-gray-500"
            }
          >
            Customers
          </NavLink>

          <NavLink
            to="/invoices"
            className={({ isActive }) =>
              isActive ? "font-semibold text-black" : "text-gray-500"
            }
          >
            Invoices
          </NavLink>

        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6">
        {children}
      </main>

    </div>
  )
}
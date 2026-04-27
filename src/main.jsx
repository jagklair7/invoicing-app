import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom' // Import here so it wraps the entire app
import './index.css' // Put this above App import
import App from './App'
import { OrgProvider } from './auth/OrgProvider'
import { AuthProvider } from './auth/AuthProvider'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter> {/* Wrap it here! */}
     <AuthProvider>
       <OrgProvider>
         <App />
       </OrgProvider>
     </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
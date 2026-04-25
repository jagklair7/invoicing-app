import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom' // Import here so it wraps the entire app
import './index.css' // Put this above App import
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter> {/* Wrap it here! */}
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
import React from 'react'
import ReactDOM from 'react-dom/client'
import { DraftApp } from './features/DraftShell'
import "./index.css"
import "./custom.css"


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
      <DraftApp />
  </React.StrictMode>,
)

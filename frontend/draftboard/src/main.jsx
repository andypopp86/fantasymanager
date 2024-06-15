import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { DraftSlot } from './features/DraftSlot.tsx'
import './index.css'

console.log("in main")
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <DraftSlot teamNum={1} playerNum={2} />
  </React.StrictMode>,
)

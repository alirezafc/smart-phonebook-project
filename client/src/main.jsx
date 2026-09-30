import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './styles.css'
import App from './pages/App.jsx'
import Login from './pages/Login.jsx'
import Admin from './pages/Admin.jsx'

// ارسال خطاهای جاوااسکریپت مرورگر به سرور برای عیب‌یابی
function reportClientError(payload) {
  try {
    fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {})
  } catch {}
}
window.addEventListener('error', e => reportClientError({
  t: 'js-error', msg: String(e.message || ''), file: String(e.filename || ''), line: e.lineno || 0
}))
window.addEventListener('unhandledrejection', e => reportClientError({
  t: 'promise-rejection', msg: String(e.reason && (e.reason.message || e.reason) || '')
}))

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/*" element={<App />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)

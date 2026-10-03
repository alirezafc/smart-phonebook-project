import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import ClaimsTab from '../components/admin/ClaimsTab.jsx'
import ModelsTab from '../components/admin/ModelsTab.jsx'
import SettingsTab from '../components/admin/SettingsTab.jsx'
import NumbersTab from '../components/admin/NumbersTab.jsx'
import UsersTab from '../components/admin/UsersTab.jsx'

const hasToken = () => { try { return !!localStorage.getItem('token') } catch { return false } }

const TABS = [
  { id: 'claims', label: 'قفل داخلی‌ها' },
  { id: 'numbers', label: 'شماره‌ها / داخلی‌ها' },
  { id: 'models', label: 'مدل تلفن‌ها' },
  { id: 'users', label: 'کاربران' },
  { id: 'settings', label: 'اتصال ایزابل' }
]

export default function Admin(){
  const navigate = useNavigate()
  const [authed, setAuthed] = useState(null)
  const [tab, setTab] = useState('claims')

  useEffect(() => {
    if (!hasToken()) { navigate('/login', { replace: true }); return }
    setAuthed(true)
  }, [])

  if (authed !== true) return null

  const logout = () => { try { localStorage.removeItem('token') } catch {} ; navigate('/') }

  const menu = (extraClass = '') => (
    <nav className={extraClass}>
      <div className="text-base font-semibold mb-4 px-2">پنل مدیریت</div>
      <div className="flex flex-col gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-right px-3 py-2 rounded-lg text-sm whitespace-nowrap ${tab === t.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
          >
            {t.label}
          </button>
        ))}
        <div className="border-t my-2" />
        <Link to="/" className="px-3 py-2 rounded-lg text-sm hover:bg-slate-100">دفترچه تلفن</Link>
        <button onClick={logout} className="text-right px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50">خروج</button>
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {/* در موبایل: نوار افقی بالا */}
      {menu('md:hidden border-b bg-white p-3 overflow-x-auto')}

      <div className="max-w-6xl mx-auto flex">
        {/* سایدبار: در DOM اول است تا در حالت RTL سمت راست نمایش داده شود */}
        {menu('hidden md:flex flex-col w-60 shrink-0 min-h-screen bg-white border-s sticky top-0 p-4')}
        <main className="flex-1 min-w-0 p-4 md:p-6">
          {tab === 'claims' && <ClaimsTab />}
          {tab === 'numbers' && <NumbersTab />}
          {tab === 'models' && <ModelsTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'settings' && <SettingsTab />}
        </main>
      </div>
    </div>
  )
}
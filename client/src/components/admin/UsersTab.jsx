import { useEffect, useState } from 'react'
import api from '../../api'

export default function UsersTab(){
  const [users, setUsers] = useState([])
  const [me, setMe] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [pwdFor, setPwdFor] = useState(null) // کاربری که پسورش تغییر می‌کند
  const [pwdVal, setPwdVal] = useState('')

  const flash = (t, m) => { setMsg(''); setErr(''); t === 'ok' ? setMsg(m) : setErr(m); setTimeout(() => { setMsg(''); setErr('') }, 3200) }

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/users')
      setUsers(data)
    } catch {
      setErr('خطا در دریافت کاربران')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
    try { setMe(localStorage.getItem('pb.adminUser') || '') } catch {}
  }, [])

  const add = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) { flash('err', 'نام کاربری و رمز عبور لازم است'); return }
    try {
      await api.post('/users', { username: username.trim(), password, name: name.trim() })
      setUsername(''); setPassword(''); setName('')
      flash('ok', `کاربر «${username.trim()}» افزوده شد`)
      load()
    } catch (e2) {
      flash('err', e2.response?.data?.message || 'خطا در افزودن کاربر')
    }
  }

  const changePwd = async (e) => {
    e.preventDefault()
    if (!pwdVal || pwdVal.length < 4) { flash('err', 'رمز عبور حداقل ۴ کاراکتر باشد'); return }
    try {
      await api.put(`/users/${pwdFor}`, { password: pwdVal })
      setPwdFor(null); setPwdVal('')
      flash('ok', 'رمز عبور تغییر کرد')
    } catch (e2) {
      flash('err', e2.response?.data?.message || 'خطا در تغییر رمز')
    }
  }

  const remove = async (u) => {
    if (!window.confirm(`کاربر «${u.username}» حذف شود؟`)) return
    try {
      await api.delete(`/users/${u.username}`)
      flash('ok', `کاربر «${u.username}» حذف شد`)
      load()
    } catch (e2) {
      flash('err', e2.response?.data?.message || 'خطا در حذف کاربر')
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">کاربران ({users.length})</h3>
        <div>
          {msg && <span className="text-sm text-green-600 mr-2">{msg}</span>}
          {err && <span className="text-sm text-red-600 mr-2">{err}</span>}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">در حال بارگذاری...</div>
      ) : (
        <div className="border rounded-xl bg-white divide-y mb-6">
          {users.map(u => (
            <div key={u.username} className="flex items-center justify-between p-3 text-sm">
              <div>
                <span className="font-medium">{u.name || '—'}</span>
                <span className="text-slate-400 mr-2 font-mono" dir="ltr">{u.username}</span>
                {u.username === me && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-lg mr-2">شما</span>}
              </div>
              <div className="flex gap-1 whitespace-nowrap">
                <button onClick={() => setPwdFor(u.username)} className="bg-slate-100 hover:bg-slate-200 text-xs px-3 py-1 rounded-lg">تغییر رمز</button>
                <button onClick={() => remove(u)} disabled={users.length <= 1} className="bg-red-50 text-red-600 hover:bg-red-100 text-xs px-3 py-1 rounded-lg disabled:opacity-40">
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={add} className="border rounded-xl p-4 bg-slate-50">
        <h4 className="font-semibold text-sm mb-3">افزودن کاربر جدید</h4>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-slate-500">نام (اختیاری)
            <input className="w-full border rounded-lg p-2 text-sm mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="نام مدیر" />
          </label>
          <label className="text-xs text-slate-500">نام کاربری
            <input className="w-full border rounded-lg p-2 text-sm mt-1" value={username} onChange={e => setUsername(e.target.value)} placeholder="m.admin" dir="ltr" />
          </label>
          <label className="text-xs text-slate-500">رمز عبور
            <input className="w-full border rounded-lg p-2 text-sm mt-1" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" />
          </label>
        </div>
        <button className="mt-3 bg-slate-900 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-700">افزودن</button>
      </form>

      {pwdFor && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={() => setPwdFor(null)}>
          <form onSubmit={changePwd} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h4 className="font-semibold mb-1">تغییر رمز عبور</h4>
            <p className="text-xs text-slate-400 mb-3 font-mono" dir="ltr">{pwdFor}</p>
            <label className="block text-xs text-slate-500">رمز عبور جدید
              <input
                autoFocus
                type="password"
                value={pwdVal}
                onChange={e => setPwdVal(e.target.value)}
                className="w-full border rounded-lg p-2 text-sm mt-1"
              />
            </label>
            <div className="flex gap-2 mt-4">
              <button type="submit" className="flex-1 bg-slate-900 text-white rounded-xl py-2 text-sm">ذخیره</button>
              <button type="button" onClick={() => setPwdFor(null)} className="px-4 border rounded-xl text-sm">انصراف</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
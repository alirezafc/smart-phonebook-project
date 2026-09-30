import { useEffect, useState } from 'react'
import api from '../../api'

export default function ClaimsTab(){
  const [claims, setClaims] = useState([])
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [c, m] = await Promise.all([
        api.get('/claims'),
        api.get('/phone-models/all')
      ])
      setClaims(c.data)
      setModels(m.data)
    } catch (e) {
      setErr('خطا در دریافت قفل داخلی‌ها')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const flash = (t, m) => { setMsg(''); setErr(''); t === 'ok' ? setMsg(m) : setErr(m); setTimeout(() => { setMsg(''); setErr('') }, 3000) }

  const release = async (ext) => {
    if (!window.confirm(`داخلی ${ext} آزاد شود؟ کاربر این رایانه باید دوباره تأیید کند.`)) return
    try {
      await api.delete(`/claims/${ext}`)
      flash('ok', `داخلی ${ext} آزاد شد`)
      load()
    } catch (e) {
      flash('err', 'خطا در آزادسازی')
    }
  }

  const changeModel = async (ext, modelId) => {
    try {
      await api.put(`/claims/${ext}/model`, { modelId: modelId ? Number(modelId) : null })
      flash('ok', `مدل داخلی ${ext} به‌روزرسانی شد`)
      load()
    } catch (e) {
      flash('err', e.response?.data?.message || 'خطا در تغییر مدل')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">قفل داخلی‌ها ({claims.length})</h3>
        {msg && <span className="text-sm text-green-600">{msg}</span>}
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">در حال بارگذاری...</div>
      ) : claims.length === 0 ? (
        <div className="text-sm text-slate-400">هیچ داخلی‌ای ثبت نشده است.</div>
      ) : (
        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-2 text-right">داخلی</th>
                <th className="p-2 text-right">صاحب شماره</th>
                <th className="p-2 text-right">IP رایانه</th>
                <th className="p-2 text-right">مدل تلفن</th>
                <th className="p-2 text-right">تاریخ ثبت</th>
                <th className="p-2 text-right">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {claims.map(c => (
                <tr key={c.extension}>
                  <td className="p-2 font-mono">{c.extension}</td>
                  <td className="p-2">{c.owner || <span className="text-slate-300">—</span>}</td>
                  <td className="p-2 font-mono text-slate-500">{c.computer_ip || '—'}</td>
                  <td className="p-2">
                    <select
                      className="border rounded-lg p-1 text-sm"
                      value={c.model_id ?? ''}
                      onChange={e => changeModel(c.extension, e.target.value)}
                    >
                      <option value="">بدون مدل</option>
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.brand} — {m.model}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-slate-500">{new Date(c.created_at).toLocaleString('fa-IR')}</td>
                  <td className="p-2">
                    <button onClick={() => release(c.extension)} className="bg-red-500 text-white text-xs px-3 py-1 rounded-lg hover:bg-red-600">
                      آزاد کردن
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
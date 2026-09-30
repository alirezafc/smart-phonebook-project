import { useEffect, useState } from 'react'
import api from '../../api'

const EMPTY = { name: '', lastname: '', samat: '', intel: '', outtel: '', mobile: '', vahed: '' }

export default function NumbersTab(){
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(null) // null | {} | row
  const [form, setForm] = useState(EMPTY)

  const load = async (p = page, query = q) => {
    setLoading(true)
    try {
      const { data } = await api.get('/numbers', { params: { q: query, page: p, limit: perPage } })
      setItems(data.items)
      setTotal(data.total)
      setPage(data.page)
    } catch {
      setErr('خطا در دریافت شماره‌ها')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [perPage])

  const flash = (t, m) => { setMsg(''); setErr(''); t === 'ok' ? setMsg(m) : setErr(m); setTimeout(() => { setMsg(''); setErr('') }, 3000) }

  const openAdd = () => { setForm(EMPTY); setEditing({}) }
  const openEdit = (row) => {
    setForm({ name: row.name || '', lastname: row.lastname || '', samat: row.samat || '', intel: row.intel || '', outtel: row.outtel || '', mobile: row.mobile || '', vahed: row.vahed || '' })
    setEditing(row)
  }

  const save = async (e) => {
    e.preventDefault()
    try {
      if (editing?.id) {
        await api.put(`/numbers/${editing.id}`, form)
        flash('ok', 'شماره ویرایش شد')
      } else {
        await api.post('/numbers', form)
        flash('ok', 'شماره جدید افزوده شد')
      }
      setEditing(null)
      load(1)
    } catch (e2) {
      flash('err', e2.response?.data?.message || 'خطا در ذخیره')
    }
  }

  const remove = async (row) => {
    if (!window.confirm(`شماره «${row.name || ''} ${row.lastname || ''}» (داخلی ${row.intel || '—'}) حذف شود؟`)) return
    try {
      await api.delete(`/numbers/${row.id}`)
      flash('ok', 'شماره حذف شد')
      load(page)
    } catch (e2) {
      flash('err', 'خطا در حذف')
    }
  }

  const changeQ = (v) => {
    setQ(v)
    clearTimeout(window.__numQ)
    window.__numQ = setTimeout(() => load(1, v), 350)
  }

  const pages = Math.max(1, Math.ceil(total / perPage))

  const label = (r) => `${r.name || ''} ${r.lastname || ''}`.trim() || '—'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="font-semibold">شماره‌ها / داخلی‌ها ({total})</h3>
        <div className="flex items-center gap-2">
          {msg && <span className="text-sm text-green-600">{msg}</span>}
          {err && <span className="text-sm text-red-600">{err}</span>}
          <input
            value={q}
            onChange={e => changeQ(e.target.value)}
            placeholder="جستجوی نام / داخلی..."
            className="border rounded-lg p-2 text-sm w-48"
          />
          <button onClick={openAdd} className="bg-slate-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-slate-700 whitespace-nowrap">
            + افزودن شماره
          </button>
        </div>
      </div>

      <div className="flex gap-1 items-center mb-3 text-xs text-slate-500">
        <span>تعداد در صفحه:</span>
        {[20, 50, 100].map(n => (
          <button key={n} onClick={() => setPerPage(n)} className={`px-2 py-1 rounded border ${perPage === n ? 'bg-slate-900 text-white' : 'bg-white'}`}>{n}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">در حال بارگذاری...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-400">موردی پیدا نشد.</div>
      ) : (
        <div className="overflow-x-auto border rounded-xl bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-2 text-right">نام</th>
                <th className="p-2 text-right">سمت</th>
                <th className="p-2 text-right">داخلی</th>
                <th className="p-2 text-right">بیرونی</th>
                <th className="p-2 text-right">موبایل</th>
                <th className="p-2 text-right">واحد</th>
                <th className="p-2">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(r => (
                <tr key={r.id}>
                  <td className="p-2">{label(r)}</td>
                  <td className="p-2 text-slate-500">{r.samat || '—'}</td>
                  <td className="p-2 font-mono">{r.intel || '—'}</td>
                  <td className="p-2 font-mono text-slate-500">{r.outtel || '—'}</td>
                  <td className="p-2 font-mono text-slate-500" dir="ltr">{r.mobile || '—'}</td>
                  <td className="p-2 text-slate-500">{r.vahed || '—'}</td>
                  <td className="p-2 whitespace-nowrap">
                    <button onClick={() => openEdit(r)} className="bg-slate-100 hover:bg-slate-200 text-xs px-3 py-1 rounded-lg">ویرایش</button>
                    <button onClick={() => remove(r)} className="bg-red-50 text-red-600 hover:bg-red-100 text-xs px-3 py-1 rounded-lg mr-1">حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => load(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 border rounded-lg text-sm disabled:opacity-40">قبلی</button>
          <span className="text-sm text-slate-500">صفحه {page} از {pages}</span>
          <button onClick={() => load(Math.min(pages, page + 1))} disabled={page >= pages} className="px-3 py-1 border rounded-lg text-sm disabled:opacity-40">بعدی</button>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={() => setEditing(null)}>
          <form onSubmit={save} className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h4 className="font-semibold mb-4">{editing.id ? 'ویرایش شماره' : 'افزودن شماره جدید'}</h4>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['name', 'نام'], ['lastname', 'نام خانوادگی'], ['samat', 'سمت'],
                ['intel', 'داخلی'], ['outtel', 'بیرونی'], ['mobile', 'موبایل'], ['vahed', 'واحد']
              ].map(([key, l]) => (
                <label key={key} className="text-xs text-slate-500">
                  {l}
                  <input
                    value={form[key] || ''}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={l}
                    className="w-full border rounded-lg p-2 text-sm text-slate-900 mt-1"
                  />
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button type="submit" className="flex-1 bg-slate-900 text-white rounded-xl py-2 text-sm hover:bg-slate-700">ذخیره</button>
              <button type="button" onClick={() => setEditing(null)} className="px-4 border rounded-xl text-sm hover:bg-slate-50">انصراف</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
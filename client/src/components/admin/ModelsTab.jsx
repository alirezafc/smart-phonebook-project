import { useEffect, useState } from 'react'
import api from '../../api'

const PROFILES = [
  { value: 'both', label: 'فوری (هر دو هدر)' },
  { value: 'callinfo', label: 'فوری (فقط Call-Info)' },
  { value: 'alertinfo', label: 'فوری (فقط Alert-Info)' },
  { value: 'none', label: 'خاموش - فقط زنگ' }
]

export default function ModelsTab(){
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [profile, setProfile] = useState('both')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/phone-models/all')
      setModels(data)
    } catch {
      setErr('خطا در دریافت مدل‌ها')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const flash = (t, m) => { setMsg(''); setErr(''); t === 'ok' ? setMsg(m) : setErr(m); setTimeout(() => { setMsg(''); setErr('') }, 3000) }

  const update = async (id, body) => {
    try {
      await api.put(`/phone-models/${id}`, body)
      load()
    } catch (e) {
      flash('err', e.response?.data?.message || 'خطا در ذخیره')
    }
  }

  const toggleActive = (m) => update(m.id, { is_active: !m.is_active })

  const add = async (e) => {
    e.preventDefault()
    if (!brand.trim() || !model.trim()) { flash('err', 'برند و مدل را وارد کنید'); return }
    try {
      await api.post('/phone-models', { brand: brand.trim(), model: model.trim(), auto_answer_profile: profile })
      setBrand(''); setModel(''); setProfile('both')
      flash('ok', 'مدل اضافه شد')
      load()
    } catch (e2) {
      flash('err', e2.response?.data?.message || 'خطا در افزودن مدل')
    }
  }

  const grouped = models.reduce((acc, m) => {
    (acc[m.brand] = acc[m.brand] || []).push(m)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">مدل تلفن‌ها ({models.length})</h3>
        <div>
          {msg && <span className="text-sm text-green-600 mr-2">{msg}</span>}
          {err && <span className="text-sm text-red-600 mr-2">{err}</span>}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">در حال بارگذاری...</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {Object.entries(grouped).map(([brandName, items]) => (
            <div key={brandName} className="border rounded-xl p-3">
              <div className="font-semibold mb-2 text-slate-700">{brandName}</div>
              <div className="space-y-2">
                {items.map(m => (
                  <div key={m.id} className={`flex items-center gap-2 text-sm ${m.is_active ? '' : 'opacity-50'}`}>
                    <span className="w-24">{m.model}</span>
                    <select
                      className="border rounded-lg p-1 text-xs flex-1"
                      value={m.auto_answer_profile}
                      onChange={e => update(m.id, { auto_answer_profile: e.target.value })}
                    >
                      {PROFILES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <button
                      onClick={() => toggleActive(m)}
                      className={`text-xs px-2 py-1 rounded-lg border ${m.is_active ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-green-600 border-green-200 hover:bg-green-50'}`}
                    >
                      {m.is_active ? 'غیرفعال' : 'فعال'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border rounded-xl p-4 bg-amber-50 border-amber-200 max-w-xl text-sm space-y-1">
        <div className="font-semibold text-amber-800 mb-1">توضیح گزینه‌های «جواب‌گویی خودکار»</div>
        <p><b className="text-amber-900">فوری (هر دو هدر)</b> — گوشی هنگام تماس از دفترچه درست موقع زنگ، خودکار جواب می‌دهد (غیربلندگو در صورت پشتیبانی تلفن). مناسب Fanvil و Alcatel.</p>
        <p><b className="text-amber-900">فوری (فقط Call-Info)</b> — با استاندارد Call-Info جواب می‌دهد؛ مناسب بیشتر تلفن‌های Yealink و GrandStream.</p>
        <p><b className="text-amber-900">فوری (فقط Alert-Info)</b> — با هدر Alert-Info جواب می‌دهد؛ برای مدل‌هایی که زنگ خودکار را از این مسیر می‌شناسند (مثل برخی ZTE).</p>
        <p><b className="text-amber-900">خاموش (فقط زنگ)</b> — هیچ هدری فرستاده نمی‌شود؛ گوشی فقط زنگ می‌خورد و باید خودتان بردارید. گزینه امن برای مدل‌های ناشناخته که نمی‌خواهید ناخواسته جواب بدهند.</p>
      </div>

      <form onSubmit={add} className="border rounded-xl p-4 bg-slate-50 max-w-xl">
        <h4 className="font-semibold text-sm mb-3">افزودن مدل جدید</h4>
        <div className="grid grid-cols-4 gap-2">
          <label className="text-xs">برند
            <input className="w-full border rounded-lg p-2 text-sm mt-1" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Fanvil" />
          </label>
          <label className="text-xs">مدل
            <input className="w-full border rounded-lg p-2 text-sm mt-1" value={model} onChange={e => setModel(e.target.value)} placeholder="X3S" />
          </label>
          <label className="text-xs">پروفایل
            <select className="w-full border rounded-lg p-1 text-xs mt-1 bg-white" value={profile} onChange={e => setProfile(e.target.value)}>
              {PROFILES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <button className="w-full bg-slate-900 text-white rounded-lg py-2 text-sm">افزودن</button>
          </div>
        </div>
      </form>
    </div>
  )
}
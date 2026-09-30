import { useEffect, useState } from 'react'
import api from '../../api'

export default function SettingsTab(){
  const [info, setInfo] = useState(null)
  const [testing, setTesting] = useState(false)

  const load = async () => {
    setTesting(true)
    try {
      const { data } = await api.get('/settings/ami-status')
      setInfo(data)
    } finally {
      setTesting(false)
    }
  }
  useEffect(() => { load() }, [])

  if (!info && testing) return <div className="text-sm text-slate-400">در حال بررسی اتصال...</div>

  const Rows = [
    ['آدرس ایزابل (AMI)', info?.host || '—'],
    ['پورت AMI', info?.port || '—'],
    ['کاربر AMI', info?.user || '—'],
    ['کانتکست تماس', info?.context || '—'],
    ['پیش‌شماره بیرونی', info?.outsidePrefix || '—']
  ]

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">اتصال به ایزابل</h3>
        <button onClick={load} disabled={testing} className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50">
          {testing ? 'در حال بررسی...' : 'بررسی دوباره اتصال'}
        </button>
      </div>

      <div className={`rounded-xl p-4 mb-4 border ${info?.connected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center gap-2 font-semibold">
          <span className={`inline-block w-3 h-3 rounded-full ${info?.connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
          {info?.connected ? 'اتصال برقرار است' : 'اتصال برقرار نیست'}
        </div>
        {info?.pbxUptime && (
          <pre dir="ltr" className="text-xs text-slate-600 mt-2 bg-white/60 rounded-lg p-2 overflow-x-auto">{info.pbxUptime}</pre>
        )}
        {info?.error && <div className="text-sm text-red-600 mt-2">{info.error}</div>}
      </div>

      <div className="border rounded-xl divide-y">
        {Rows.map(([k, v]) => (
          <div key={k} className="flex justify-between p-3 text-sm">
            <span className="text-slate-500">{k}</span>
            <span className="font-mono">{v}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 mt-3">
        این مقادیر از فایل <code dir="ltr">server/.env</code> خوانده شده‌اند و اینجا فقط نمایش داده می‌شوند.
      </p>
    </div>
  )
}
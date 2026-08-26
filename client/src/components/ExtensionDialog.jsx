import { useEffect, useRef, useState } from 'react'
import api from '../api'

export default function ExtensionDialog({ onClose, onSaved, currentExt = '', canRelease = false }){
  const [ext, setExt] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | calling
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [digitsGot, setDigitsGot] = useState(0)
  const [error, setError] = useState('')
  const debounceRef = useRef(null)
  const pollRef = useRef(null)
  const tickRef = useRef(null)

  const stopTimers = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
  }

  // بستن مطمئن: حتی اگر onSaved خطا بدهد، مدال حتماً بسته شود
  const uiLog = (action, extra) => {
    try {
      fetch('/api/client-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: 'ui', action, phase, ...(extra || {}) }),
        keepalive: true
      }).catch(() => {})
    } catch {}
  }
  // بررسی اینکه آیا overlay مدال واقعاً از DOM حذف شده (و چند لایه وجود دارد)
  const domCheck = () => setTimeout(() => {
    let count = -1
    try { count = document.querySelectorAll('[class*="bg-black/40"]').length } catch {}
    uiLog('domcheck-result', { overlayCount: count })
  }, 150)
  const close = () => { uiLog('close'); stopTimers(); onClose(); domCheck() }
  const saveAndClose = (payload) => {
    stopTimers()
    try { onSaved(payload) } catch {}
    onClose()
  }

  useEffect(() => () => stopTimers(), [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); setSearching(false); return }
    setSearching(true)
    debounceRef.current = setTimeout(() => {
      api.get('/numbers', { params: { q: query.trim(), limit: 8 } })
        .then(res => setResults(res.data.items.filter(r => r.intel && String(r.intel).trim())))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const markNone = () => {
    uiLog('none-btn')
    saveAndClose({ status: 'none' })
    domCheck()
  }

  const cancelCalling = () => {
    uiLog('cancel')
    stopTimers()
    setPhase('idle')
    setError('')
  }

  // کلید Esc هم مدال را می‌بندد
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && phase !== 'calling') { uiLog('esc'); close() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  const startVerify = async () => {
    if (!/^\d{2,6}$/.test(ext)) { setError('شماره داخلی را وارد کنید'); return }
    setError('')
    try{
      const { data } = await api.post('/call/verify/start', { callerExtension: ext }, { timeout: 15000 })
      if (data.attemptId && data.code) {
        setCode(data.code)
        setDigitsGot(0)
        setCountdown(data.ttl || 30)
        setPhase('calling')
        pollResult(data.attemptId)
        runCountdown(data.ttl || 30)
      } else {
        setError(data.reason || 'شروع تأیید ناموفق بود')
      }
    }catch(err){
      setError(err.response?.data?.reason || err.response?.data?.message || 'خطا در شروع تماس تأیید')
    }
  }

  const runCountdown = (ttl) => {
    if (tickRef.current) clearInterval(tickRef.current)
    let left = ttl
    tickRef.current = setInterval(() => {
      left -= 1
      setCountdown(Math.max(0, left))
      if (left <= 0 && tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    }, 1000)
  }

  const pollResult = (id) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try{
        const { data } = await api.get('/call/verify/result', { params: { id } })
        if (typeof data.digits === 'number') setDigitsGot(data.digits)
        if (data.status === 'success') {
          saveAndClose({ status: 'verified', ext })
        } else if (data.status === 'failed') {
          stopTimers()
          setPhase('idle')
          let msg = data.reason || 'تأیید انجام نشد'
          if (!data.digits) msg += ' — هیچ کلیدی از تلفن دریافت نشد؛ اگر کد را زدید، حالت DTMF تلفن باید RFC2833 باشد.'
          setError(msg)
        }
      }catch(err){
        if (err.response?.status === 404) {
          stopTimers(); setPhase('idle')
          setError('نشست تأیید منقضی شد؛ دوباره تلاش کنید')
        }
      }
    }, 1200)
  }

  const releaseMine = async () => {
    setError('')
    try{
      const { data } = await api.post('/call/release', { callerExtension: currentExt }, { timeout: 10000 })
      if (data.released) {
        saveAndClose({ status: 'unset' })
      } else {
        setError('آزادسازی انجام نشد؛ این داخلی روی این رایانه ثبت نشده است')
      }
    }catch(err){
      setError(err.response?.data?.error || 'خطا در آزادسازی داخلی')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={phase !== 'calling' ? close : undefined}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">تنظیم شماره داخلی</h2>
        <p className="text-sm text-slate-500 mb-4">برای تماس از روی دفترچه، داخلی تلفن روی میزتان را یکبار تأیید کنید.</p>

        {canRelease && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex items-center justify-between gap-2">
            <span className="text-sm">داخلی فعلی شما: <b>{currentExt}</b></span>
            <button onClick={releaseMine} className="bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-red-600 whitespace-nowrap">
              آزاد کردن این داخلی
            </button>
          </div>
        )}

        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

        {phase === 'calling' ? (
          <>
            <div className="border rounded-xl p-5 mb-3 text-center bg-slate-50">
              <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                <span>گوشی بردارید و کد را با کیپد بزنید:</span>
                <span className={`font-mono font-bold ${countdown <= 10 ? 'text-red-600' : 'text-slate-900'}`}>
                  ۰:{String(countdown).padStart(2, '0')}
                </span>
              </div>
              <div dir="ltr" className="text-4xl font-bold tracking-[0.5em] my-4 text-slate-900">{code}</div>
              <div dir="ltr" className="flex justify-center gap-3 my-3">
                {[0,1,2,3].map(i => (
                  <span key={i} className={`w-4 h-4 rounded-full border-2 ${i < digitsGot ? 'bg-green-500 border-green-600' : 'border-slate-300'}`}></span>
                ))}
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-amber-700">
                <span className="inline-block w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></span>
                در انتظار وارد کردن کد...
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={markNone} className="px-4 border rounded-xl hover:bg-slate-50">داخلی ندارم</button>
              <button onClick={cancelCalling} className="flex-1 border rounded-xl py-2 hover:bg-slate-50">انصراف</button>
            </div>
          </>
        ) : (
          <>
            <label className="block mb-3 text-sm">
              شماره داخلی شما
              <input
                inputMode="numeric"
                value={ext}
                onChange={e => setExt(e.target.value.replace(/\D/g, ''))}
                placeholder="مثلاً 309"
                disabled={!!currentExt}
                className="w-full border rounded-xl p-2 mt-1"
              />
            </label>

            {!currentExt && (
              <>
                <div className="text-center text-xs text-slate-400 my-2">─── یا جستجوی نام خودتان ───</div>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="نام و نام خانوادگی..."
                  className="w-full border rounded-xl p-2 mb-2"
                />
                {(searching || results.length > 0) && (
                  <div className="border rounded-xl max-h-48 overflow-y-auto mb-3 divide-y">
                    {searching && <div className="p-2 text-sm text-slate-400">در حال جستجو...</div>}
                    {!searching && results.length === 0 && (
                      <div className="p-2 text-sm text-slate-400">نتیجه‌ای با شماره داخلی پیدا نشد</div>
                    )}
                    {results.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setExt(String(r.intel).trim())}
                        className="w-full text-right p-2 hover:bg-slate-50 flex justify-between items-center gap-2"
                      >
                        <span className="text-sm">{r.name} {r.lastname} <span className="text-slate-400">— {r.vahed}</span></span>
                        <span className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded-lg">{r.intel}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2 mt-2">
              <button onClick={startVerify} disabled={!!currentExt} className="flex-1 bg-slate-900 text-white rounded-xl py-2 disabled:opacity-50">
                تأیید با کد تلفنی
              </button>
              {!canRelease && (
                <button onClick={markNone} className="px-4 border rounded-xl hover:bg-slate-50">داخلی ندارم</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

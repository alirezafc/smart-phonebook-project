import { useEffect, useRef, useState } from 'react'
import api from '../api'

const RING_TIMEOUT = 75 * 1000        // سقف انتظار برای جواب‌دادن مقصد (بعدش Asterisk خودش قطع می‌کند)
const MAX_LOCK = 4 * 60 * 60 * 1000    // سقف ایمنی مدال قفل

const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

export default function NumbersTable({ data, onPageChange, canCall, extension, onRequestExtension }){
  const { items = [], page = 1, pages = 1, total = 0 } = data || {}
  const [calling, setCalling] = useState(null) // { callId, name, target }
  const [callMsg, setCallMsg] = useState('')
  const [callStatus, setCallStatus] = useState('ringing')
  const [elapsed, setElapsed] = useState(0)
  const pollRef = useRef(null)
  const tickRef = useRef(null)
  const startedRef = useRef(0)
  const connectedAtRef = useRef(0)
  const wasConnectedRef = useRef(false)

  const stopPolling = () => {
    if (pollRef.current){ clearInterval(pollRef.current); pollRef.current = null }
    if (tickRef.current){ clearInterval(tickRef.current); tickRef.current = null }
  }

  useEffect(() => () => stopPolling(), [])

  const closeModal = () => {
    stopPolling()
    setCalling(null)
    setCallMsg('')
    setCallStatus('ringing')
    setElapsed(0)
    wasConnectedRef.current = false
  }

  const handleCall = async (targetNumber, fullName) => {
    if (!canCall){
      onRequestExtension()
      return
    }
    if (calling || pollRef.current) return
    setCalling({ name: fullName, target: targetNumber })
    startedRef.current = Date.now()
    wasConnectedRef.current = false
    setCallMsg('')
    setCallStatus('ringing')
    setElapsed(0)
    try{
      const { data: result } = await api.post('/call', { callerExtension: extension, targetNumber, callerName: fullName }, { timeout: 15000 })
      if (!result.success) {
        closeModal()
        alert(result.error || 'خطا در برقراری تماس')
        return
      }
      setCalling(c => ({ ...c, callId: result.callId }))
      stopPolling()
      pollRef.current = setInterval(async () => {
        const total_ = Date.now() - startedRef.current
        if (total_ > MAX_LOCK){
          closeModal()
          alert('مدال تماس بسته شد (سقف زمانی)')
          return
        }
        try{
          const { data: st } = await api.get(`/call/status/${result.callId}`, { timeout: 8000 })
          setCallStatus(st.status)
          if (st.status === 'connected'){
            if (!wasConnectedRef.current){
              wasConnectedRef.current = true
              connectedAtRef.current = Date.now()
              setCallMsg('تماس برقرار شد')
              tickRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - connectedAtRef.current) / 1000)), 1000)
            }
          } else if (st.status === 'ended' || st.status === 'failed'){
            // تماس تمام شد → مدال بسته می‌شود
            setCallMsg(wasConnectedRef.current ? 'تماس پایان یافت' : 'تماس برقرار نشد')
            stopPolling()
            setTimeout(closeModal, 1500)
          } else if (st.status === 'unknown' || st.status === 'forbidden'){
            stopPolling()
            setTimeout(closeModal, 300)
          }
        }catch{
          // خطای شبکه موقتی است → به پولینگ ادامه می‌دهیم مگر خیلی طولانی شود
          if (Date.now() - startedRef.current > RING_TIMEOUT && !wasConnectedRef.current){
            stopPolling()
            closeModal()
          }
        }
      }, 1200)
    }catch(err){
      closeModal()
      alert(err.response?.data?.error || 'ارتباط با سرور برقرار نشد')
    }
  }

  const hangupCall = () => {
    try { if (calling?.callId) api.post('/call/hangup', { callId: calling.callId }).catch(()=>{}) } catch {}
    setCallMsg('در حال قطع تماس...')
  }

  const lockNote = () => {
    if (callStatus === 'connected') return 'تا زمانی که تماس از گوشی قطع نشده، این صفحه قفل است.'
    return 'تا زمانی که تماس برقرار نشده یا از گوشی قطع نشده، این صفحه قفل است.'
  }

  return (
    <>

      {calling && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-[100]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            {callStatus === 'connected' ? (
              <div className="w-10 h-10 rounded-full bg-green-500 grid place-items-center mx-auto mb-3 text-white text-xl">✓</div>
            ) : (
              <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            )}
            <h3 className="font-semibold text-lg">در حال تماس با <span className="text-amber-700">{calling.name}</span></h3>
            {callStatus === 'connected' && (
              <div dir="ltr" className="font-mono text-2xl font-bold text-slate-900 my-2">{fmt(elapsed)}</div>
            )}
            <p className="text-sm text-slate-500 mt-1">{callMsg || 'گوشی شما زنگ می‌خورد...'}</p>
            <p className="text-xs text-slate-400 mt-2">{lockNote()}</p>
            {callStatus !== 'ended' && (
              <button onClick={hangupCall} className="mt-4 px-5 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600">قطع تماس</button>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-amber-500/90 text-white">
              <tr>
                <th className="px-3 py-2">نام</th>
                <th className="px-3 py-2">نام خانوادگی</th>
                <th className="px-3 py-2">سمت سازمانی</th>
                <th className="px-3 py-2">واحد</th>
                <th className="px-3 py-2">داخلی</th>
                <th className="px-3 py-2">تلفن مستقیم</th>
                <th className="px-3 py-2">موبایل</th>
              </tr>
            </thead>
            <tbody>
              {items.map(row => {
                const fullName = `${row.name || ''} ${row.lastname || ''}`.trim()
                return (
                  <tr key={row.id} className="odd:bg-slate-50">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.lastname}</td>
                    <td className="px-3 py-2">{row.samat}</td>
                    <td className="px-3 py-2">{row.vahed}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.intel}
                      {' '}
                      {row.intel && (
                        <button
                          disabled={calling?.target === String(row.intel)}
                          className="mx-1 bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 disabled:opacity-50"
                          onClick={() => handleCall(String(row.intel), fullName)}
                        >
                          تماس
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.outtel}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.mobile}
                      {' '}
                      {row.mobile && (
                        <button
                          disabled={calling?.target === String(row.mobile)}
                          className="mx-1 bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 disabled:opacity-50"
                          onClick={() => handleCall(String(row.mobile), fullName)}
                        >
                          تماس
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-3 text-sm">
          <div>تعداد کل: {total}</div>
          <div className="space-x-2 space-x-reverse">
            <button disabled={page<=1} onClick={()=>onPageChange(page-1)} className="px-3 py-1 rounded-lg border disabled:opacity-50">قبلی</button>
            <span>صفحه {page} از {pages}</span>
            <button disabled={page>=pages} onClick={()=>onPageChange(page+1)} className="px-3 py-1 rounded-lg border disabled:opacity-50">بعدی</button>
          </div>
        </div>
      </div>
    </>
  )
}
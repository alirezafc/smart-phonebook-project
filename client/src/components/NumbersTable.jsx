import { useEffect, useRef, useState } from 'react'
import api from '../api'

const POLL_TIMEOUT = 60 * 1000 // اگر در این مدت جواب نداد، مدال بسته و پیام داده می‌شود

export default function NumbersTable({ data, onPageChange, canCall, extension, onRequestExtension }){
  const { items = [], page = 1, pages = 1, total = 0 } = data || {}
  const [calling, setCalling] = useState(null) // { callId, name, target }
  const [callMsg, setCallMsg] = useState('')
  const pollRef = useRef(null)
  const startedRef = useRef(0)

  const stopPolling = () => { if (pollRef.current){ clearInterval(pollRef.current); pollRef.current = null } }

  useEffect(() => () => stopPolling(), [])

  const closeModal = () => {
    stopPolling()
    setCalling(null)
    setCallMsg('')
  }

  const handleCall = async (targetNumber, fullName) => {
    if (!canCall){
      onRequestExtension()
      return
    }
    if (calling || pollRef.current) return
    setCalling({ name: fullName, target: targetNumber })
    startedRef.current = Date.now()
    setCallMsg('')
    try{
      const { data: result } = await api.post('/call', { callerExtension: extension, targetNumber, callerName: fullName }, { timeout: 15000 })
      if (!result.success) {
        closeModal()
        alert(result.error || 'خطا در برقراری تماس')
        return
      }
      stopPolling()
      pollRef.current = setInterval(async () => {
        const elapsed = Date.now() - startedRef.current
        if (elapsed > POLL_TIMEOUT){
          stopPolling()
          setCalling(null)
          setCallMsg('')
          alert('در زمان تعیین‌شده پاسخ داده نشد')
          return
        }
        try{
          const { data: st } = await api.get(`/call/status/${result.callId}`, { timeout: 8000 })
          if (st.status === 'connected' || st.status === 'failed' || st.status === 'ended' || st.status === 'unknown') {
            if (st.status === 'connected') setCallMsg('تماس برقرار شد')
            else if (st.status === 'failed') setCallMsg('تماس موفق نبود')
            stopPolling()
            setTimeout(closeModal, 1200) // کمی صبر می‌کنیم تا پیام دیده شود
          }
        }catch{
          stopPolling()
          setCalling(null)
          setCallMsg('')
        }
      }, 1200)
    }catch(err){
      closeModal()
      alert(err.response?.data?.error || 'ارتباط با سرور برقرار نشد')
    }
  }

  const cancelCall = () => {
    closeModal()
    try { if (calling?.target) api.post('/call/hangup', { callId: calling.callId }).catch(()=>{}) } catch {}
  }

  return (
    <>

      {calling && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <h3 className="font-semibold text-lg">در حال تماس با <span className="text-amber-700">{calling.name}</span></h3>
            <p className="text-sm text-slate-500 mt-1">
              {callMsg || (canCall ? 'گوشی شما زنگ می‌خورد...' : 'در حال برقراری تماس...')}
            </p>
            <button onClick={cancelCall} className="mt-4 px-5 py-2 border rounded-xl hover:bg-slate-50">بستن</button>
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
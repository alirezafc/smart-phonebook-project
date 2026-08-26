import { useState } from 'react'
import api from '../api'

export default function NumbersTable({ data, onPageChange, canCall, extension, onRequestExtension }){
  const { items = [], page = 1, pages = 1, total = 0 } = data || {}
  const [calling, setCalling] = useState(null)

  const handleCall = async (targetNumber) => {
    if (!canCall){
      onRequestExtension()
      return
    }
    if (calling) return
    try{
      setCalling(targetNumber)
      const { data: result } = await api.post('/call', { callerExtension: extension, targetNumber }, { timeout: 15000 })
      if (result.success) {
        alert('در حال تماس... گوشی خود را بردارید')
      } else {
        alert(result.error || 'خطا در برقراری تماس')
      }
    }catch(err){
      alert(err.response?.data?.error || 'ارتباط با سرور برقرار نشد')
    }finally{
      setCalling(null)
    }
  }

  return (
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
            {items.map(row => (
              <tr key={row.id} className="odd:bg-slate-50">
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.lastname}</td>
                <td className="px-3 py-2">{row.samat}</td>
                <td className="px-3 py-2">{row.vahed}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.intel}
                  {' '}
                  {row.intel && (
                  <button
                    disabled={calling === String(row.intel)}
                    className="mx-1 bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 disabled:opacity-50"
                    onClick={() => handleCall(String(row.intel))}
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
                    disabled={calling === String(row.mobile)}
                    className="mx-1 bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 disabled:opacity-50"
                    onClick={() => handleCall(String(row.mobile))}
                  >
                     تماس
                  </button>
                  )}
                </td>
              </tr>
            ))}
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
  )
}

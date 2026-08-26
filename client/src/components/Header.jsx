export default function Header({ status, ext, onOpenSettings, onLogout }){
  return (
    <div className="bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto p-4 flex items-center justify-between gap-3">
        <div className="text-lg font-semibold">لیست شماره تلفن های پرسنل</div>
        <div className="flex items-center gap-2">
          {status === 'verified' ? (
            <button
              onClick={onOpenSettings}
              className="bg-green-500/20 border border-green-400/40 hover:bg-green-500/30 px-3 py-1 rounded-lg text-sm"
              title="تغییر شماره داخلی"
            >
              داخلی من: {ext} ✓
            </button>
          ) : (
            <button onClick={onOpenSettings} className="bg-amber-500 hover:bg-amber-600 px-3 py-1 rounded-lg text-sm font-medium">
              {status === 'none' ? 'تنظیم داخلی (اختیاری)' : 'تنظیم شماره داخلی'}
            </button>
          )}
          <button onClick={onLogout} className="bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg">خروج</button>
        </div>
      </div>
    </div>
  )
}

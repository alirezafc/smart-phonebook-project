import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import Header from '../components/Header.jsx'
import SearchBar from '../components/SearchBar.jsx'
import NumbersTable from '../components/NumbersTable.jsx'
import ExtensionDialog from '../components/ExtensionDialog.jsx'

const EXT_KEY = 'pb.myExtension'
const STATUS_KEY = 'pb.extStatus' // 'verified' | 'none'

function readStorage(){
  try{
    const ext = localStorage.getItem(EXT_KEY) || ''
    const status = localStorage.getItem(STATUS_KEY)
    if (status === 'verified' && ext) return { status: 'verified', ext }
    if (status === 'none') return { status: 'none', ext: '' }
  }catch{}
  return { status: 'unset', ext: '' }
}

function hasToken(){ try { return !!localStorage.getItem('token') } catch { return false } }

export default function App(){
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [unit, setUnit] = useState('')
  const [units, setUnits] = useState([])
  const [data, setData] = useState({ items: [], page: 1, pages: 1, total: 0 })
  const [page, setPage] = useState(1)
  const [{ status, ext }, setExtState] = useState(readStorage)
  // مدال فقط برای کسی که هنوز هیچ انتخابی نکرده، خودکار باز می‌شود
  const [dialogOpen, setDialogOpen] = useState(() => readStorage().status === 'unset')

  useEffect(()=>{
    api.get('/units').then(res => setUnits(res.data)).catch(()=>{})
  },[])

  // اگر قفل داخلی سمت سرور آزاد/جابجا شده باشد، وضعیت محلی باطل شود
  useEffect(()=>{
    if (status !== 'verified' || !ext) return
    api.get('/call/claim-check', { params: { ext } })
      .then(res => { if (res.data?.mine === false) {
        setExtState({ status: 'unset', ext: '' })
        try { localStorage.removeItem(EXT_KEY); localStorage.removeItem(STATUS_KEY) } catch {}
      }})
      .catch(()=>{})
  },[])

  useEffect(()=>{
    api.get('/numbers',{ params: { q, page, vahed: unit }}).then(res=> setData(res.data))
  }, [q, page, unit])

  const handleSaved = ({ status: s, ext: e }) => {
    setExtState({ status: s, ext: e })
    try{
      if (s === 'verified'){ localStorage.setItem(EXT_KEY, e); localStorage.setItem(STATUS_KEY, 'verified') }
      else { localStorage.removeItem(EXT_KEY); if (s === 'none') localStorage.setItem(STATUS_KEY, 'none'); else localStorage.removeItem(STATUS_KEY) }
    }catch{}
  }

  return (
    <div className="min-h-screen">
      <Header
        status={status}
        ext={ext}
        onOpenSettings={()=>setDialogOpen(true)}
        onLogout={()=>{ localStorage.removeItem('token'); navigate('/login') }}
        showAdmin={hasToken()}
      />
      <div className="max-w-6xl mx-auto p-4">
        <SearchBar value={q} onChange={setQ} units={units} unit={unit} onUnitChange={setUnit} />
        <NumbersTable
          data={data}
          onPageChange={setPage}
          canCall={status === 'verified'}
          extension={ext}
          onRequestExtension={()=>setDialogOpen(true)}
        />
      </div>
      {dialogOpen && (
        <ExtensionDialog
          onClose={()=>setDialogOpen(false)}
          onSaved={handleSaved}
          currentExt={status === 'verified' ? ext : ''}
          canRelease={status === 'verified'}
        />
      )}
    </div>
  )
}


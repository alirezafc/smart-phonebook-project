import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Login(){
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    try{
      const { data } = await api.post('/auth/login', { username, password })
      localStorage.setItem('token', data.token)
      navigate('/')
    }catch(err){
      setError(err.response?.data?.message || 'خطا در ورود')
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-slate-100">
      <form onSubmit={submit} className="bg-white p-6 rounded-2xl shadow w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-4 text-center">ورود</h1>
        {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
        <label className="block mb-2">نام کاربری
          <input className="w-full border rounded-xl p-2 mt-1" value={username} onChange={e=>setUsername(e.target.value)} />
        </label>
        <label className="block mb-4">رمز عبور
          <input type="password" className="w-full border rounded-xl p-2 mt-1" value={password} onChange={e=>setPassword(e.target.value)} />
        </label>
        <button className="w-full bg-slate-900 text-white rounded-xl py-2">ورود</button>
      </form>
    </div>
  )
}

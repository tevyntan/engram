import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { login } from '../auth'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/feed'

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full bg-white flex items-center justify-center">
      <div className="w-full max-w-sm px-8 py-10 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2.5 mb-8">
          <img src="/Engram-Logo.png" alt="Engram logo" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
          <span className="font-semibold text-slate-800 text-base tracking-tight">Engram</span>
        </div>

        <h1 className="text-xl font-bold text-slate-800 mb-1">Owner access</h1>
        <p className="text-sm text-slate-400 mb-6">Enter your password to add or delete memories.</p>

        {error && (
          <div className="mb-4 rounded-lg px-3 py-2.5 text-sm border bg-red-50 border-red-200 text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoFocus
            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all"
          />
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:cursor-not-allowed text-white disabled:text-slate-400 text-sm font-semibold transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

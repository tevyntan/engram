import { useState } from 'react'
import FileTab from '../components/FileTab'
import { getToken, isLoggedIn, login } from '../auth'

const API = import.meta.env.VITE_API_URL

const TABS = [
  { id: 'text',  label: 'Text',  defaultType: 'note' },
  { id: 'file',  label: 'File',  defaultType: 'document' },
  { id: 'url',   label: 'URL',   defaultType: 'article' },
]

function makeForm(contentType) {
  return { title: '', content_type: contentType, collection: '' }
}

export default function FeedPage() {
  const [authed, setAuthed]     = useState(isLoggedIn())
  const [activeTab, setActiveTab] = useState('text')
  const [forms, setForms] = useState({
    text: { ...makeForm('note'),     text: '' },
    file: { ...makeForm('document'), file: null },
    url:  { ...makeForm('article'),  url: '' },
  })
  const [loading, setLoading]   = useState(false)
  const [result,  setResult]    = useState(null)

  const form = forms[activeTab]

  function setField(field, value) {
    setForms(prev => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [field]: value },
    }))
  }

  function handleTabChange(tabId) {
    setActiveTab(tabId)
    setResult(null)
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  function isSubmittable() {
    if (!form.title.trim()) return false
    if (activeTab === 'text') return !!form.text.trim()
    if (activeTab === 'url')  return !!form.url.trim()
    return false
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isSubmittable()) return

    setLoading(true)
    setResult(null)

    try {
      let res

      if (activeTab === 'text') {
        res = await fetch(`${API}/ingest/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
          body: JSON.stringify({
            title:        form.title.trim(),
            content_type: form.content_type.trim() || 'note',
            text:         form.text.trim(),
            collection:   form.collection.trim() || null,
          }),
        })
      } else {
        res = await fetch(`${API}/ingest/url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
          body: JSON.stringify({
            url:          form.url.trim(),
            title:        form.title.trim(),
            content_type: form.content_type.trim() || 'article',
            collection:   form.collection.trim() || null,
          }),
        })
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }

      const data = await res.json()
      setResult({ success: true, chunks: data.chunks_ingested })

      // Reset only the active tab's form
      const defaultType = TABS.find(t => t.id === activeTab).defaultType
      setForms(prev => ({
        ...prev,
        [activeTab]: { ...makeForm(defaultType), ...(activeTab === 'text' ? { text: '' } : { url: '' }) },
      }))
    } catch (err) {
      setResult({ success: false, message: err.message || 'Something went wrong. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const wordCount       = activeTab === 'text' && form.text?.trim() ? form.text.trim().split(/\s+/).length : 0
  const estimatedChunks = wordCount > 0 ? Math.ceil(wordCount / 500) : 0

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-full bg-white overflow-y-auto relative">
      {!authed && <AuthOverlay onAuth={() => setAuthed(true)} />}
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Add to Memory</h1>
          <p className="text-sm text-slate-400 mt-1">
            Save text, documents, or URLs to your memory engine.
          </p>
        </div>

        {/* Result banner */}
        {result && (
          <div className={`mb-6 rounded-xl px-4 py-3 text-sm border flex items-start gap-2 ${
            result.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-600'
          }`}>
            <span className="text-base leading-none mt-0.5">{result.success ? '✓' : '✗'}</span>
            <span>
              {result.success
                ? `Memory saved! ${result.chunks} chunk${result.chunks !== 1 ? 's' : ''} stored in Engram.`
                : result.message}
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* File tab has its own self-contained bulk-upload UI */}
        {activeTab === 'file' && <FileTab />}

        {/* Form (text / url tabs) */}
        {activeTab !== 'file' && (
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => setField('title', e.target.value)}
              placeholder={
                activeTab === 'text' ? 'e.g. React useEffect deep dive' :
                'e.g. How transformers work'
              }
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all"
            />
          </div>

          {/* Content type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Content Type
            </label>
            <input
              type="text"
              value={form.content_type}
              onChange={e => setField('content_type', e.target.value)}
              placeholder="note, article, document, youtube..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all"
            />
            <p className="text-xs text-slate-400 mt-1">
              Defaults to &ldquo;{TABS.find(t => t.id === activeTab).defaultType}&rdquo; if left blank
            </p>
          </div>

          {/* Collection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Collection
            </label>
            <input
              type="text"
              value={form.collection}
              onChange={e => setField('collection', e.target.value)}
              placeholder="e.g. modules, work-notes (optional)"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all"
            />
            <p className="text-xs text-slate-400 mt-1">Group related items together — leave blank to skip</p>
          </div>

          {/* Tab-specific input */}
          {activeTab === 'text' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  Content <span className="text-red-400">*</span>
                </label>
                {wordCount > 0 && (
                  <span className="text-xs text-slate-400">
                    {wordCount.toLocaleString()} words &middot; ~{estimatedChunks} chunk{estimatedChunks !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <textarea
                value={form.text}
                onChange={e => setField('text', e.target.value)}
                placeholder="Paste or type your content here..."
                required
                rows={14}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all resize-none font-mono leading-relaxed"
              />
            </div>
          )}

          {activeTab === 'url' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                URL <span className="text-red-400">*</span>
              </label>
              <input
                type="url"
                value={form.url}
                onChange={e => setField('url', e.target.value)}
                placeholder="https://..."
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all"
              />
              <p className="text-xs text-slate-400 mt-1">Supports articles and YouTube video URLs</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !isSubmittable()}
            className="w-full py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:cursor-not-allowed text-white disabled:text-slate-400 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Spinner /> Saving to memory...</>
            ) : (
              'Save to Memory'
            )}
          </button>
        </form>
        )}

      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AuthOverlay({ onAuth }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(password)
      onAuth()
    } catch (err) {
      setError(err.message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm bg-white/60">
      <div className="w-full max-w-sm mx-4 px-8 py-10 rounded-2xl border border-gray-100 shadow-lg bg-white">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Owner access</h2>
        <p className="text-sm text-slate-400 mb-6">Enter your password to add memories.</p>

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

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}



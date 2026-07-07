import { useState } from 'react'

const API = 'http://localhost:8000'

export default function FeedPage() {
  const [form, setForm] = useState({ title: '', content_type: 'note', text: '' })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const wordCount = form.text.trim() ? form.text.trim().split(/\s+/).length : 0
  const estimatedChunks = wordCount > 0 ? Math.ceil(wordCount / 500) : 0

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.text.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const payload = {
        title: form.title.trim(),
        content_type: form.content_type.trim() || 'note',
        text: form.text.trim(),
      }
      const res = await fetch(`${API}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      const data = await res.json()
      setResult({ success: true, chunks: data.chunks_ingested })
      setForm({ title: '', content_type: 'note', text: '' })
    } catch (err) {
      setResult({ success: false, message: err.message || 'Something went wrong. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full bg-white overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Add to Memory</h1>
          <p className="text-sm text-slate-400 mt-1">
            Save a note, article, video transcript, or any content to your memory engine.
          </p>
        </div>

        {/* Result banner */}
        {result && (
          <div
            className={`mb-6 rounded-xl px-4 py-3 text-sm border flex items-start gap-2 ${
              result.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-600'
            }`}
          >
            <span className="text-base leading-none mt-0.5">{result.success ? '✓' : '✗'}</span>
            <span>
              {result.success
                ? `Memory saved! ${result.chunks} chunk${result.chunks !== 1 ? 's' : ''} stored in Engram.`
                : result.message}
            </span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. React useEffect deep dive"
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
              name="content_type"
              value={form.content_type}
              onChange={handleChange}
              placeholder="note, article, youtube, pdf, leetcode..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all"
            />
            <p className="text-xs text-slate-400 mt-1">Defaults to "note" if left blank</p>
          </div>

          {/* Content */}
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
              name="text"
              value={form.text}
              onChange={handleChange}
              placeholder="Paste or type your content here..."
              required
              rows={14}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all resize-none font-mono leading-relaxed"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !form.title.trim() || !form.text.trim()}
            className="w-full py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:cursor-not-allowed text-white disabled:text-slate-400 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Spinner /> Saving to memory...
              </>
            ) : (
              'Save to Memory'
            )}
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

import { useState, useRef, useCallback } from 'react'

const API = 'https://engram-production-b370.up.railway.app'

const TABS = [
  { id: 'text',  label: 'Text',  defaultType: 'note' },
  { id: 'file',  label: 'File',  defaultType: 'document' },
  { id: 'url',   label: 'URL',   defaultType: 'article' },
]

function makeForm(contentType) {
  return { title: '', content_type: contentType }
}

export default function FeedPage() {
  const [activeTab, setActiveTab] = useState('text')
  const [forms, setForms] = useState({
    text: { ...makeForm('note'),     text: '' },
    file: { ...makeForm('document'), file: null },
    url:  { ...makeForm('article'),  url: '' },
  })
  const [loading, setLoading]   = useState(false)
  const [result,  setResult]    = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

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

  // ── File drag-and-drop ──────────────────────────────────────────────────────

  const acceptFile = useCallback((file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext !== 'pdf' && ext !== 'docx') {
      setResult({ success: false, message: 'Only PDF and Word (.docx) files are supported.' })
      return
    }
    setResult(null)
    setForms(prev => ({ ...prev, file: { ...prev.file, file } }))
  }, [])

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    acceptFile(e.dataTransfer.files[0])
  }

  function handleDragOver(e) { e.preventDefault(); setDragging(true) }
  function handleDragLeave()  { setDragging(false) }

  function handleFileInput(e) {
    acceptFile(e.target.files[0])
    e.target.value = ''
  }

  function removeFile() {
    setForms(prev => ({ ...prev, file: { ...prev.file, file: null } }))
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  function isSubmittable() {
    if (!form.title.trim()) return false
    if (activeTab === 'text') return !!form.text.trim()
    if (activeTab === 'file') return !!form.file
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:        form.title.trim(),
            content_type: form.content_type.trim() || 'note',
            text:         form.text.trim(),
          }),
        })
      } else if (activeTab === 'file') {
        const fd = new FormData()
        fd.append('file',         form.file)
        fd.append('title',        form.title.trim())
        fd.append('content_type', form.content_type.trim() || 'document')
        res = await fetch(`${API}/ingest/file`, { method: 'POST', body: fd })
      } else {
        res = await fetch(`${API}/ingest/url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url:          form.url.trim(),
            title:        form.title.trim(),
            content_type: form.content_type.trim() || 'article',
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
        [activeTab]: { ...makeForm(defaultType), ...(activeTab === 'text' ? { text: '' } : activeTab === 'file' ? { file: null } : { url: '' }) },
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
    <div className="h-full bg-white overflow-y-auto">
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

        {/* Form */}
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
                activeTab === 'file' ? 'e.g. Q3 Research Report' :
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

          {activeTab === 'file' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                File <span className="text-red-400">*</span>
              </label>
              {form.file ? (
                <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 bg-slate-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileIcon ext={form.file.name.split('.').pop().toLowerCase()} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{form.file.name}</p>
                      <p className="text-xs text-slate-400">{(form.file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    className="ml-3 text-slate-400 hover:text-red-500 transition-colors text-lg leading-none flex-shrink-0"
                    aria-label="Remove file"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center gap-2 px-6 py-10 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                    dragging
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                >
                  <UploadIcon dragging={dragging} />
                  <p className="text-sm font-medium text-slate-600">
                    {dragging ? 'Drop your file here' : 'Drag & drop or click to upload'}
                  </p>
                  <p className="text-xs text-slate-400">PDF or Word (.docx) only</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>
              )}
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

      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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

function UploadIcon({ dragging }) {
  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
      dragging ? 'bg-indigo-100' : 'bg-slate-100'
    }`}>
      <svg
        className={`w-5 h-5 transition-colors ${dragging ? 'text-indigo-500' : 'text-slate-400'}`}
        fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
      </svg>
    </div>
  )
}

function FileIcon({ ext }) {
  const isPdf = ext === 'pdf'
  return (
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
      isPdf ? 'bg-red-50' : 'bg-blue-50'
    }`}>
      <span className={`text-xs font-bold uppercase ${isPdf ? 'text-red-500' : 'text-blue-500'}`}>
        {ext}
      </span>
    </div>
  )
}

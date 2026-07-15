import { useState, useRef, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL
const ACCEPTED_EXTENSIONS = ['pdf', 'docx']

function cleanFilename(filename) {
  const withoutExt = filename.replace(/\.[^/.]+$/, '')
  const spaced = withoutExt.replace(/[_-]+/g, ' ').trim()
  if (!spaced) return filename
  return spaced
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getExt(filename) {
  return filename.split('.').pop().toLowerCase()
}

let nextRowId = 0
function makeRow(file) {
  return {
    id: `${Date.now()}-${nextRowId++}`,
    file,
    title: cleanFilename(file.name),
    status: 'pending',   // pending | ingesting | success | error
    error: null,
    chunks: null,
  }
}

export default function FileTab() {
  const [rows, setRows]               = useState([])
  const [contentType, setContentType] = useState('lecture')
  const [collection, setCollection]   = useState('')
  const [dragging, setDragging]       = useState(false)
  const [ingesting, setIngesting]     = useState(false)
  const [summary, setSummary]         = useState(null)
  const [globalError, setGlobalError] = useState(null)
  const fileInputRef = useRef(null)

  // ── File selection ──────────────────────────────────────────────────────────

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return

    const accepted = []
    const rejected = []

    for (const file of incoming) {
      if (ACCEPTED_EXTENSIONS.includes(getExt(file.name))) {
        accepted.push(file)
      } else {
        rejected.push(file.name)
      }
    }

    setGlobalError(
      rejected.length
        ? `Skipped ${rejected.length} unsupported file${rejected.length !== 1 ? 's' : ''} ` +
          `(only PDF and Word .docx are supported): ${rejected.join(', ')}`
        : null
    )

    if (accepted.length) {
      setSummary(null)
      setRows(prev => {
        const existingKeys = new Set(prev.map(r => `${r.file.name}-${r.file.size}`))
        const newRows = accepted
          .filter(f => !existingKeys.has(`${f.name}-${f.size}`))
          .map(makeRow)
        return [...prev, ...newRows]
      })
    }
  }, [])

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    if (!ingesting) addFiles(e.dataTransfer.files)
  }
  function handleDragOver(e) { e.preventDefault(); if (!ingesting) setDragging(true) }
  function handleDragLeave()  { setDragging(false) }
  function handleFileInput(e) {
    addFiles(e.target.files)
    e.target.value = ''
  }

  function updateRowTitle(id, title) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, title } : r)))
  }

  function removeRow(id) {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  function clearAll() {
    setRows([])
    setSummary(null)
    setGlobalError(null)
  }

  const isSubmittable = rows.length > 0 && rows.every(r => r.title.trim()) && !ingesting

  // ── Ingestion ───────────────────────────────────────────────────────────────

  async function ingestOne(row) {
    const fd = new FormData()
    fd.append('file', row.file)
    fd.append('title', row.title.trim())
    fd.append('content_type', contentType.trim() || 'lecture')
    if (collection.trim()) fd.append('collection', collection.trim())

    const res = await fetch(`${API}/ingest/file`, { method: 'POST', body: fd })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `Server error ${res.status}`)
    }
    return res.json()
  }

  async function handleIngestAll() {
    if (!isSubmittable) return

    setIngesting(true)
    setSummary(null)
    setGlobalError(null)
    setRows(prev => prev.map(r => ({ ...r, status: 'pending', error: null, chunks: null })))

    const total = rows.length
    let succeeded = 0

    // Sequential, one file at a time, continuing past failures.
    for (const row of rows) {
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status: 'ingesting' } : r)))
      try {
        const data = await ingestOne(row)
        succeeded += 1
        setRows(prev => prev.map(r =>
          r.id === row.id ? { ...r, status: 'success', chunks: data.chunks_ingested, error: null } : r
        ))
      } catch (err) {
        setRows(prev => prev.map(r =>
          r.id === row.id ? { ...r, status: 'error', error: err.message || 'Failed to ingest' } : r
        ))
      }
    }

    setIngesting(false)
    const failed = total - succeeded
    setSummary({
      failed,
      message: failed === 0
        ? `${succeeded}/${total} files ingested successfully`
        : `${succeeded}/${total} files ingested (${failed} failed)`,
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {globalError && (
        <div className="rounded-xl px-4 py-3 text-sm border bg-red-50 border-red-200 text-red-600">
          {globalError}
        </div>
      )}

      {summary && (
        <div className={`rounded-xl px-4 py-3 text-sm border flex items-start gap-2 ${
          summary.failed === 0
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          <span className="text-base leading-none mt-0.5">{summary.failed === 0 ? '✓' : '⚠'}</span>
          <span>{summary.message}</span>
        </div>
      )}

      {/* Content type — applies to the whole batch */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Content Type <span className="text-xs font-normal text-slate-400">(applies to all files)</span>
        </label>
        <input
          type="text"
          value={contentType}
          onChange={e => setContentType(e.target.value)}
          placeholder="lecture, note, article, document..."
          disabled={ingesting}
          className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>

      {/* Collection — optional, applies to the whole batch */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Collection <span className="text-xs font-normal text-slate-400">(applies to all files, optional)</span>
        </label>
        <input
          type="text"
          value={collection}
          onChange={e => setCollection(e.target.value)}
          placeholder="e.g. cs2109, work-notes"
          disabled={ingesting}
          className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all disabled:bg-slate-50 disabled:text-slate-400"
        />
        <p className="text-xs text-slate-400 mt-1">Group related files together — leave blank to skip</p>
      </div>

      {/* Dropzone */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Files <span className="text-red-400">*</span>
        </label>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !ingesting && fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-lg border-2 border-dashed transition-colors ${
            ingesting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
          } ${
            dragging
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-gray-200 hover:border-indigo-300 hover:bg-slate-50'
          }`}
        >
          <UploadIcon dragging={dragging} />
          <p className="text-sm font-medium text-slate-600">
            {dragging ? 'Drop your files here' : 'Drag & drop or click to upload (multiple files supported)'}
          </p>
          <p className="text-xs text-slate-400">PDF or Word (.docx) only</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            multiple
            onChange={handleFileInput}
            disabled={ingesting}
            className="hidden"
          />
        </div>
      </div>

      {/* Per-file table */}
      {rows.length > 0 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200">
                <th className="text-left font-medium text-slate-500 px-4 py-2.5 w-8"></th>
                <th className="text-left font-medium text-slate-500 px-4 py-2.5 w-40">Filename</th>
                <th className="text-left font-medium text-slate-500 px-4 py-2.5">Title</th>
                <th className="text-left font-medium text-slate-500 px-4 py-2.5 w-32">Status</th>
                <th className="px-4 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-4 py-2.5">
                    <FileIcon ext={getExt(row.file.name)} />
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 truncate" title={row.file.name}>
                    {row.file.name}
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="text"
                      value={row.title}
                      onChange={e => updateRowTitle(row.id, e.target.value)}
                      disabled={ingesting}
                      className="w-full px-2.5 py-1.5 rounded-md border border-gray-200 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <RowStatus row={row} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      disabled={ingesting}
                      className="text-slate-400 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg leading-none"
                      aria-label={`Remove ${row.file.name}`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      {rows.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleIngestAll}
            disabled={!isSubmittable}
            className="flex-1 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:cursor-not-allowed text-white disabled:text-slate-400 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {ingesting ? (
              <>
                <Spinner />
                Ingesting {rows.filter(r => r.status === 'success' || r.status === 'error').length}/{rows.length}...
              </>
            ) : (
              `Ingest All (${rows.length})`
            )}
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={ingesting}
            className="px-4 py-2.5 rounded-lg border border-gray-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function RowStatus({ row }) {
  switch (row.status) {
    case 'ingesting':
      return <span className="inline-flex items-center gap-1.5 text-slate-500">⏳ Ingesting...</span>
    case 'success':
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-600" title={`${row.chunks} chunk(s) ingested`}>
          ✅ Ingested
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 text-red-500 truncate block" title={row.error}>
          ❌ {row.error}
        </span>
      )
    default:
      return <span className="text-slate-400">Pending</span>
  }
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
    <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
      isPdf ? 'bg-red-50' : 'bg-blue-50'
    }`}>
      <span className={`text-[9px] font-bold uppercase ${isPdf ? 'text-red-500' : 'text-blue-500'}`}>
        {ext}
      </span>
    </div>
  )
}

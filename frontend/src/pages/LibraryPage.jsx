import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL

const BADGE = {
  youtube:  'bg-red-50 text-red-600 border-red-100',
  pdf:      'bg-orange-50 text-orange-600 border-orange-100',
  document: 'bg-blue-50 text-blue-600 border-blue-100',
  note:     'bg-indigo-50 text-indigo-600 border-indigo-100',
  article:  'bg-emerald-50 text-emerald-600 border-emerald-100',
  leetcode: 'bg-amber-50 text-amber-600 border-amber-100',
}

function badgeClass(type) {
  return BADGE[type?.toLowerCase()] ?? 'bg-slate-100 text-slate-500 border-slate-200'
}

function formatSource(source) {
  if (!source || source === 'direct_input') return { label: 'Pasted text', href: null }
  try {
    new URL(source)
    return { label: source, href: source }
  } catch {
    return { label: source, href: null }
  }
}

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function LibraryPage() {
  const [items, setItems]     = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    fetch(`${API}/library`)
      .then(res => {
        if (!res.ok) throw new Error(`Server error ${res.status}`)
        return res.json()
      })
      .then(data => {
        setItems(data.items)
        setTotal(data.total)
      })
      .catch(err => setError(err.message || 'Failed to load library.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="h-full bg-white overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Library</h1>
          <p className="text-sm text-slate-400 mt-1">
            {loading
              ? 'Loading your memories…'
              : error
              ? 'Could not load library.'
              : total === 0
              ? 'No memories saved yet.'
              : `${total} item${total !== 1 ? 's' : ''} in your memory engine`}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl px-4 py-3 text-sm border flex items-start gap-2 bg-red-50 border-red-200 text-red-600">
            <span className="text-base leading-none mt-0.5">✗</span>
            <span>{error}</span>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-100 p-4 space-y-2.5 animate-pulse">
                <div className="flex items-center justify-between gap-3">
                  <div className="h-4 bg-slate-100 rounded w-2/5" />
                  <div className="h-5 bg-slate-100 rounded-full w-16" />
                </div>
                <div className="h-3.5 bg-slate-100 rounded w-3/5" />
                <div className="h-3 bg-slate-100 rounded w-1/4" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && total === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">Nothing saved yet</p>
            <p className="text-xs text-slate-400 mt-1">Head to the Feed page to add your first memory.</p>
          </div>
        )}

        {/* Cards */}
        {!loading && !error && items.length > 0 && (
          <div className="space-y-3">
            {items.map((item, i) => {
              const src  = formatSource(item.source)
              const date = formatDate(item.date_ingested)
              return (
                <div
                  key={i}
                  className="rounded-xl border border-gray-100 px-4 py-4 hover:border-indigo-100 hover:bg-slate-50 transition-colors"
                >
                  {/* Title + badge */}
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800 leading-snug">{item.title}</p>
                    <span className={`flex-shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full border ${badgeClass(item.content_type)}`}>
                      {item.content_type || 'unknown'}
                    </span>
                  </div>

                  {/* Source */}
                  <div className="mt-1.5">
                    {src.href ? (
                      <a
                        href={src.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-500 hover:text-indigo-600 hover:underline truncate block max-w-full transition-colors"
                      >
                        {src.label}
                      </a>
                    ) : (
                      <p className="text-xs text-slate-400 truncate">{src.label}</p>
                    )}
                  </div>

                  {/* Footer: chunks · date */}
                  <div className="mt-2.5 flex items-center gap-3 text-xs text-slate-400">
                    <span>{item.chunks} chunk{item.chunks !== 1 ? 's' : ''}</span>
                    {date && (
                      <>
                        <span className="text-slate-200">&middot;</span>
                        <span>{date}</span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}

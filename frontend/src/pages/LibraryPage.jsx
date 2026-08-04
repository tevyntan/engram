import { useState, useEffect } from 'react'
import { getToken, isLoggedIn } from '../auth'

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
  const [query, setQuery]     = useState('')
  const [cardState, setCardState] = useState({}) // title -> { confirming, deleting, error }

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

  const filteredItems = items.filter(item => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      item.title?.toLowerCase().includes(q) ||
      item.content_type?.toLowerCase().includes(q) ||
      item.tags?.some(tag => tag.toLowerCase().includes(q))
    )
  })

  function setCard(title, patch) {
    setCardState(prev => ({ ...prev, [title]: { ...prev[title], ...patch } }))
  }

  function requestDelete(title) {
    setCard(title, { confirming: true, error: null })
  }

  function cancelDelete(title) {
    setCard(title, { confirming: false, error: null })
  }

  async function confirmDelete(title) {
    setCard(title, { deleting: true, error: null })
    try {
      const res = await fetch(`${API}/library/${encodeURIComponent(title)}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` } })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      setItems(prev => prev.filter(item => item.title !== title))
      setTotal(prev => Math.max(0, prev - 1))
    } catch (err) {
      setCard(title, { deleting: false, confirming: false, error: err.message || 'Failed to delete.' })
    }
  }

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

        {/* Search */}
        {!loading && !error && total > 0 && (
          <div className="relative mb-6">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by title or content type, or tag..."
              className="w-full pl-10 pr-9 py-2.5 rounded-lg border border-gray-200 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors text-lg leading-none"
              >
                ×
              </button>
            )}
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

        {/* No search results */}
        {!loading && !error && total > 0 && filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm font-medium text-slate-600">No results for &ldquo;{query}&rdquo;</p>
            <p className="text-xs text-slate-400 mt-1">Try a different title, content type or tag.</p>
          </div>
        )}

        {/* Cards */}
        {!loading && !error && filteredItems.length > 0 && (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const src   = formatSource(item.source)
              const date  = formatDate(item.date_ingested)
              const state = cardState[item.title] || {}
              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-gray-100 px-4 py-4 hover:border-indigo-100 hover:bg-slate-50 transition-colors"
                >
                  {/* Title + badge + delete */}
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800 leading-snug">{item.title}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${badgeClass(item.content_type)}`}>
                        {item.content_type || 'unknown'}
                      </span>
                      {isLoggedIn() && !state.confirming && (
                        <button
                          type="button"
                          onClick={() => requestDelete(item.title)}
                          disabled={state.deleting}
                          aria-label={`Delete ${item.title}`}
                          className="text-slate-300 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
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
                  
                  {/* Collection */}
                  {item.collection && (
                    <div className="mt-2">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                        {item.collection}
                      </span>
                    </div>
                  )}

                  {/* Tags */}
                  {item.tags?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.tags.map(tag => (
                        <span
                          key={tag}
                          className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

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

                  {/* Inline delete confirmation */}
                  {state.confirming && (
                    <div className="mt-3 flex items-center gap-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm">
                      <span className="text-red-600">Delete this memory?</span>
                      <button
                        type="button"
                        onClick={() => confirmDelete(item.title)}
                        disabled={state.deleting}
                        className="font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
                      >
                        {state.deleting ? 'Deleting…' : 'Yes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelDelete(item.title)}
                        disabled={state.deleting}
                        className="text-slate-500 hover:text-slate-700 disabled:opacity-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Delete error */}
                  {state.error && (
                    <div className="mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                      {state.error}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0-.867 12.142A2 2 0 0115.138 21H8.862a2 2 0 01-1.995-1.858L6 7h12z" />
    </svg>
  )
}

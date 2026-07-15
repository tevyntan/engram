import { useState, useEffect, useMemo } from 'react'

const API = import.meta.env.VITE_API_URL

const BADGE = {
  youtube:  'bg-red-50 text-red-600 border-red-100',
  pdf:      'bg-orange-50 text-orange-600 border-orange-100',
  document: 'bg-blue-50 text-blue-600 border-blue-100',
  lecture:  'bg-blue-50 text-blue-600 border-blue-100',
  note:     'bg-indigo-50 text-indigo-600 border-indigo-100',
  article:  'bg-emerald-50 text-emerald-600 border-emerald-100',
}

function badgeClass(type) {
  return BADGE[type?.toLowerCase()] ?? 'bg-slate-100 text-slate-500 border-slate-200'
}

export default function TitleSelector({ actionLabel, onAction, disabled }) {
  const [titles, setTitles]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [selected, setSelected]     = useState(new Set())
  const [filterType, setFilterType] = useState('all')
  const [filterColl, setFilterColl] = useState('all')
  const [filterTag, setFilterTag]   = useState('all')

  useEffect(() => {
    fetch(`${API}/library/titles`)
      .then(r => { if (!r.ok) throw new Error(`Server error ${r.status}`); return r.json() })
      .then(data => setTitles(data.titles || []))
      .catch(e => setError(e.message || 'Failed to load titles.'))
      .finally(() => setLoading(false))
  }, [])

  const contentTypes = useMemo(() => {
    const s = new Set(titles.map(t => t.content_type).filter(Boolean))
    return ['all', ...Array.from(s).sort()]
  }, [titles])

  const collections = useMemo(() => {
    const s = new Set(titles.map(t => t.collection).filter(Boolean))
    return ['all', ...Array.from(s).sort()]
  }, [titles])

  const tags = useMemo(() => {
    const s = new Set(titles.flatMap(t => t.tags || []).filter(Boolean))
    return ['all', ...Array.from(s).sort()]
  }, [titles])

  const filtered = useMemo(() => titles.filter(t => {
    if (filterType !== 'all' && t.content_type !== filterType) return false
    if (filterColl !== 'all' && t.collection !== filterColl) return false
    if (filterTag  !== 'all' && !(t.tags || []).includes(filterTag)) return false
    return true
  }), [titles, filterType, filterColl, filterTag])

  function toggle(title) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(title) ? next.delete(title) : next.add(title)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filtered.map(t => t.title)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  const selectedCount = selected.size
  const canAct = selectedCount > 0 && !disabled

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 p-4 animate-pulse flex items-center gap-3">
            <div className="w-4 h-4 rounded bg-slate-100 flex-shrink-0" />
            <div className="h-4 bg-slate-100 rounded w-2/5" />
            <div className="h-5 bg-slate-100 rounded-full w-16 ml-auto" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl px-4 py-3 text-sm border bg-red-50 border-red-200 text-red-600 flex items-start gap-2">
        <span className="text-base leading-none mt-0.5">✗</span>
        <span>{error}</span>
      </div>
    )
  }

  if (titles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-600">No memories saved yet</p>
        <p className="text-xs text-slate-400 mt-1">Head to the Feed page to add your first memory.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select
          label="Type"
          value={filterType}
          onChange={setFilterType}
          options={contentTypes}
        />
        {collections.length > 1 && (
          <Select
            label="Collection"
            value={filterColl}
            onChange={setFilterColl}
            options={collections}
          />
        )}
        {tags.length > 1 && (
          <Select
            label="Tag"
            value={filterTag}
            onChange={setFilterTag}
            options={tags}
          />
        )}
      </div>

      {/* Select all / deselect all */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {selectedCount > 0
            ? `${selectedCount} title${selectedCount !== 1 ? 's' : ''} selected`
            : 'No titles selected'}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            disabled={disabled}
            className="text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            Select all
          </button>
          {selectedCount > 0 && (
            <>
              <span className="text-slate-300 text-xs">·</span>
              <button
                type="button"
                onClick={deselectAll}
                disabled={disabled}
                className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                Deselect all
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No titles match the selected filters.</p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {filtered.map(item => {
            const isChecked = selected.has(item.title)
            return (
              <label
                key={item.title}
                className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border cursor-pointer transition-colors ${
                  isChecked
                    ? 'border-indigo-200 bg-indigo-50'
                    : 'border-gray-100 hover:border-indigo-100 hover:bg-slate-50'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => !disabled && toggle(item.title)}
                  className="mt-0.5 accent-indigo-500 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800 leading-snug">{item.title}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${badgeClass(item.content_type)}`}>
                      {item.content_type || 'unknown'}
                    </span>
                    {item.collection && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100 flex-shrink-0">
                        {item.collection}
                      </span>
                    )}
                  </div>
                  {item.tags?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.tags.map(tag => (
                        <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </label>
            )
          })}
        </div>
      )}

      {/* Action button */}
      <button
        type="button"
        onClick={() => onAction(Array.from(selected))}
        disabled={!canAct}
        className="w-full py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:cursor-not-allowed text-white disabled:text-slate-400 text-sm font-semibold transition-colors"
      >
        {actionLabel}
      </button>
    </div>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-500 font-medium">{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all bg-white"
      >
        {options.map(opt => (
          <option key={opt} value={opt}>
            {opt === 'all' ? `All ${label}s` : opt}
          </option>
        ))}
      </select>
    </div>
  )
}

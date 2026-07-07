export default function LibraryPage() {
  return (
    <div className="h-full bg-white flex items-center justify-center">
      <div className="text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
          <span className="text-3xl">📚</span>
        </div>
        <h2 className="text-xl font-bold text-slate-700 mb-2">Library</h2>
        <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
          Browse, search, and manage all your saved memories here.
        </p>
        <div className="mt-5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-500 text-xs font-medium border border-indigo-100">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Coming in Phase 2
        </div>
      </div>
    </div>
  )
}

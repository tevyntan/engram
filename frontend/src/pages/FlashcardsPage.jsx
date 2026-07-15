import { useState } from 'react'
import TitleSelector from '../components/TitleSelector'

const API = import.meta.env.VITE_API_URL

export default function FlashcardsPage() {
  const [phase, setPhase]       = useState('select')  // select | loading | study | done
  const [cards, setCards]       = useState([])
  const [index, setIndex]       = useState(0)
  const [flipped, setFlipped]   = useState(false)
  const [error, setError]       = useState(null)
  const [titlesUsed, setTitlesUsed] = useState([])

  async function handleBegin(selectedTitles) {
    setError(null)
    setPhase('loading')

    try {
      const res = await fetch(`${API}/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles: selectedTitles, num_cards: 12 }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      const data = await res.json()
      setCards(data.flashcards)
      setTitlesUsed(data.titles_used)
      setIndex(0)
      setFlipped(false)
      setPhase('study')
    } catch (e) {
      setError(e.message || 'Failed to generate flashcards.')
      setPhase('select')
    }
  }

  function next() {
    if (index + 1 >= cards.length) {
      setPhase('done')
    } else {
      setIndex(i => i + 1)
      setFlipped(false)
    }
  }

  function prev() {
    setIndex(i => Math.max(0, i - 1))
    setFlipped(false)
  }

  function restart() {
    setIndex(0)
    setFlipped(false)
    setPhase('study')
  }

  function endSession() {
    setPhase('select')
    setCards([])
    setFlipped(false)
    setIndex(0)
    setError(null)
  }

  return (
    <div className="h-full bg-white overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Flashcards</h1>
          <p className="text-sm text-slate-400 mt-1">
            {phase === 'select' || phase === 'loading'
              ? 'Select topics to generate flashcards from your notes.'
              : `${titlesUsed.length} topic${titlesUsed.length !== 1 ? 's' : ''} · ${cards.length} cards`}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl px-4 py-3 text-sm border bg-red-50 border-red-200 text-red-600 flex items-start gap-2">
            <span className="text-base leading-none mt-0.5">✗</span>
            <span>{error}</span>
          </div>
        )}

        {/* Select phase */}
        {(phase === 'select' || phase === 'loading') && (
          <>
            {phase === 'loading' && (
              <div className="mb-6 rounded-xl px-4 py-4 border border-indigo-100 bg-indigo-50 flex items-center gap-3 text-sm text-indigo-700">
                <Spinner className="text-indigo-500" />
                <span>Generating flashcards from your notes…</span>
              </div>
            )}
            <TitleSelector
              actionLabel="Begin Study Session"
              onAction={handleBegin}
              disabled={phase === 'loading'}
            />
          </>
        )}

        {/* Study phase */}
        {phase === 'study' && cards.length > 0 && (
          <StudySession
            cards={cards}
            index={index}
            flipped={flipped}
            onFlip={() => setFlipped(f => !f)}
            onNext={next}
            onPrev={prev}
            onEnd={endSession}
          />
        )}

        {/* Done phase */}
        {phase === 'done' && (
          <CompletionScreen
            total={cards.length}
            onRestart={restart}
            onEnd={endSession}
          />
        )}

      </div>
    </div>
  )
}

function StudySession({ cards, index, flipped, onFlip, onNext, onPrev, onEnd }) {
  const card = cards[index]
  const total = cards.length
  const progress = ((index + 1) / total) * 100

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 font-medium">Card {index + 1} of {total}</span>
          <button
            type="button"
            onClick={onEnd}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors font-medium"
          >
            End Session
          </button>
        </div>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-400 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Flip card */}
      <div
        className="relative cursor-pointer select-none"
        style={{ perspective: '1200px', height: '280px' }}
        onClick={onFlip}
      >
        <div
          className="absolute inset-0 transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 rounded-2xl border border-gray-100 shadow-sm bg-white flex flex-col items-center justify-center px-8 py-8"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-4">Question</span>
            <p className="text-lg font-medium text-slate-800 text-center leading-relaxed">{card.question}</p>
            <span className="mt-6 text-xs text-slate-400">Click to reveal answer</span>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 rounded-2xl border border-indigo-100 shadow-sm bg-indigo-50 flex flex-col items-center justify-center px-8 py-8"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <span className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-4">Answer</span>
            <p className="text-base text-slate-700 text-center leading-relaxed">{card.answer}</p>
          </div>
        </div>
      </div>

      {/* Flip button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onFlip}
          className="px-5 py-2 rounded-lg border border-gray-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
        >
          <FlipIcon />
          {flipped ? 'Show Question' : 'Reveal Answer'}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPrev}
          disabled={index === 0}
          className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <ChevronLeft /> Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {index + 1 === cards.length ? 'Finish' : 'Next'} <ChevronRight />
        </button>
      </div>
    </div>
  )
}

function CompletionScreen({ total, onRestart, onEnd }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-5">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
        <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-800">Session Complete!</h2>
        <p className="text-sm text-slate-400 mt-1">You reviewed all {total} card{total !== 1 ? 's' : ''}.</p>
      </div>
      <div className="flex gap-3 w-full max-w-xs">
        <button
          type="button"
          onClick={onRestart}
          className="flex-1 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold transition-colors"
        >
          Restart
        </button>
        <button
          type="button"
          onClick={onEnd}
          className="flex-1 py-2.5 rounded-lg border border-gray-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          New Session
        </button>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

function FlipIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

function ChevronLeft() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

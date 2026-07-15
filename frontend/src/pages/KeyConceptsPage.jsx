import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import TitleSelector from '../components/TitleSelector'

const API = import.meta.env.VITE_API_URL

export default function KeyConceptsPage() {
  const [phase, setPhase]           = useState('select')  // select | loading | guide
  const [summary, setSummary]       = useState('')
  const [context, setContext]       = useState('')
  const [titlesUsed, setTitlesUsed] = useState([])
  const [error, setError]           = useState(null)
  const [messages, setMessages]     = useState([])
  const [input, setInput]           = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError]   = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatLoading])

  async function handleGenerate(selectedTitles) {
    setError(null)
    setPhase('loading')

    try {
      const res = await fetch(`${API}/concepts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles: selectedTitles }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      const data = await res.json()
      setSummary(data.summary)
      setContext(data.context)
      setTitlesUsed(data.titles_used)
      setMessages([])
      setPhase('guide')
    } catch (e) {
      setError(e.message || 'Failed to generate study guide.')
      setPhase('select')
    }
  }

  async function handleSend() {
    const question = input.trim()
    if (!question || chatLoading) return

    const userMsg = { role: 'user', content: question }
    const assistantMsg = { role: 'assistant', content: '', streaming: true }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setChatLoading(true)
    setChatError(null)

    const chatHistory = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch(`${API}/concepts/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context, chat_history: chatHistory }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop()

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          const json = JSON.parse(part.slice(6))
          if (json.type === 'token') {
            setMessages(prev => {
              const msgs = [...prev]
              const last = msgs[msgs.length - 1]
              msgs[msgs.length - 1] = { ...last, content: last.content + json.content }
              return msgs
            })
          } else if (json.type === 'done') {
            setMessages(prev => {
              const msgs = [...prev]
              const last = msgs[msgs.length - 1]
              msgs[msgs.length - 1] = { ...last, streaming: false }
              return msgs
            })
          } else if (json.type === 'error') {
            throw new Error(json.detail || 'Stream error')
          }
        }
      }
    } catch (e) {
      setChatError(e.message || 'Something went wrong.')
      setMessages(prev => {
        const msgs = [...prev]
        const last = msgs[msgs.length - 1]
        if (last?.streaming) msgs[msgs.length - 1] = { ...last, streaming: false }
        return msgs
      })
    } finally {
      setChatLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function startOver() {
    setPhase('select')
    setSummary('')
    setContext('')
    setTitlesUsed([])
    setMessages([])
    setInput('')
    setChatError(null)
    setError(null)
  }

  return (
    <div className="h-full bg-white overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Key Concepts</h1>
            <p className="text-sm text-slate-400 mt-1">
              {phase === 'select' || phase === 'loading'
                ? 'Select topics to generate a structured study guide.'
                : `Study guide for ${titlesUsed.length} topic${titlesUsed.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          {phase === 'guide' && (
            <button
              type="button"
              onClick={startOver}
              className="text-sm font-medium text-slate-500 hover:text-slate-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors flex-shrink-0"
            >
              Start Over
            </button>
          )}
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
                <Spinner />
                <span>Reading your notes and building a study guide…</span>
              </div>
            )}
            <TitleSelector
              actionLabel="Generate Study Guide"
              onAction={handleGenerate}
              disabled={phase === 'loading'}
            />
          </>
        )}

        {/* Guide phase */}
        {phase === 'guide' && (
          <div className="space-y-8">
            {/* Markdown summary */}
            <div className="prose prose-sm prose-slate max-w-none rounded-2xl border border-gray-100 px-6 py-6 bg-slate-50 markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
            </div>

            {/* Follow-up chat */}
            <div>
              <h2 className="text-sm font-semibold text-slate-600 mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                Follow-up Questions
              </h2>

              {/* Message thread */}
              {messages.length > 0 && (
                <div className="space-y-4 mb-4">
                  {messages.map((msg, i) =>
                    msg.role === 'user' ? (
                      <div key={i} className="flex justify-end">
                        <div className="max-w-sm bg-indigo-500 text-white rounded-2xl rounded-tr-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div key={i} className="flex justify-start">
                        <div className="max-w-xl bg-white border border-gray-100 rounded-2xl rounded-tl-md px-4 py-3 text-sm text-slate-700 leading-relaxed shadow-sm markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          {msg.streaming && (
                            <span className="inline-flex gap-1 items-center ml-1 align-middle">
                              <span className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  )}
                  <div ref={bottomRef} />
                </div>
              )}

              {/* Chat error */}
              {chatError && (
                <div className="mb-3 rounded-xl px-4 py-3 text-sm border bg-red-50 border-red-200 text-red-600">
                  {chatError}
                </div>
              )}

              {/* Input bar */}
              <div className="flex items-end gap-3 bg-gray-50 rounded-2xl border border-gray-200 px-4 py-3 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-50 transition-all">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a follow-up question about this material…"
                  rows={1}
                  disabled={chatLoading}
                  className="flex-1 bg-transparent resize-none outline-none text-sm text-slate-700 placeholder-slate-400 disabled:opacity-50"
                  style={{ maxHeight: '6rem', overflowY: 'auto' }}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || chatLoading}
                  className="flex-shrink-0 w-8 h-8 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  <svg
                    className={`w-4 h-4 ${!input.trim() || chatLoading ? 'text-slate-400' : 'text-white'}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-slate-300 text-center mt-2">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        )}

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

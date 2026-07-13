import { useState, useRef, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL

export default function ChatPage({ conversation, onNewConversation, onUpdateConversation }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(Date.now())
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const messages = conversation?.messages || []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(interval)
  }, [loading])

  async function handleSend() {
    const question = input.trim()
    if (!question || loading) return

    let convId = conversation?.id
    if (!convId) {
      convId = onNewConversation()
    }

    const userMessage = { role: 'user', content: question }
    onUpdateConversation(convId, conv => ({
      ...conv,
      title: conv.messages.length === 0 ? question.slice(0, 42) : conv.title,
      messages: [...conv.messages, userMessage, { role: 'assistant', content: '', streaming: true, sources: [], startedAt: Date.now() }],
    }))

    setInput('')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
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
            onUpdateConversation(convId, conv => {
              const messages = [...conv.messages]
              const last = messages[messages.length - 1]
              messages[messages.length - 1] = { ...last, content: last.content + json.content }
              return { ...conv, messages }
            })
          } else if (json.type === 'done') {
            onUpdateConversation(convId, conv => {
              const messages = [...conv.messages]
              const last = messages[messages.length - 1]
              messages[messages.length - 1] = {
                ...last,
                streaming: false,
                sources: json.sources || [],
                elapsedMs: Date.now() - (last.startedAt || Date.now()),
              }
              return { ...conv, messages }
            })
          } else if (json.type === 'error') {
            throw new Error(json.detail || 'Stream error')
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      onUpdateConversation(convId, conv => {
        const messages = [...conv.messages]
        const last = messages[messages.length - 1]
        if (last?.streaming) messages[messages.length - 1] = { ...last, streaming: false }
        return { ...conv, messages }
      })
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-100 px-6 py-4">
        <h1 className="text-sm font-semibold text-slate-700">
          {conversation?.title || 'Chat with Engram'}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Ask anything from your saved memories</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 && !loading && <EmptyState />}

        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <UserMessage key={i} content={msg.content} />
          ) : (
            <AssistantMessage
              key={i}
              content={msg.content}
              sources={msg.sources}
              streaming={msg.streaming}
              elapsedMs={msg.streaming ? now - msg.startedAt : msg.elapsedMs}
            />
          )
        )}

        {error && (
          <div className="flex justify-center">
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 max-w-md">
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-gray-100 px-6 py-4">
        <div className="flex items-end gap-3 bg-gray-50 rounded-2xl border border-gray-200 px-4 py-3 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-50 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Engram something..."
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-slate-700 placeholder-slate-400"
            style={{ maxHeight: '8rem', overflowY: 'auto' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-8 h-8 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            <svg
              className={`w-4 h-4 ${!input.trim() || loading ? 'text-slate-400' : 'text-white'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-slate-300 text-center mt-2">
          Enter to send &middot; Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-64 text-center px-8 pt-20">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
        <span className="text-3xl">🧠</span>
      </div>
      <h2 className="text-lg font-semibold text-slate-700 mb-2">What's on your mind?</h2>
      <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
        Ask Engram anything from your saved memories — notes, articles, videos, or anything you've ingested.
      </p>
    </div>
  )
}

function UserMessage({ content }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-xl bg-indigo-500 text-white rounded-2xl rounded-tr-md px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
        {content}
      </div>
    </div>
  )
}

function AssistantMessage({ content, sources, streaming, elapsedMs }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-2xl space-y-2.5">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-indigo-600 text-xs font-bold">E</span>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-md px-4 py-3 text-sm text-slate-700 leading-relaxed shadow-sm whitespace-pre-wrap">
            {content}
            {streaming && (
              <span className="inline-flex gap-1 items-center ml-1 align-middle">
                <span className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            )}
          </div>
        </div>

        {typeof elapsedMs === 'number' && (
          <p className="ml-10 text-xs text-slate-300">
            {streaming ? 'Thinking' : 'Responded in'} {(elapsedMs / 1000).toFixed(1)}s
          </p>
        )}

        {sources && sources.length > 0 && (
          <div className="ml-10 flex flex-wrap gap-2">
            {sources.map((source, i) => (
              <SourceChip key={i} source={source} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SourceChip({ source, index }) {
  const title = source.metadata?.title || `Source ${index + 1}`
  const score = (source.score * 100).toFixed(0)
  const contentType = source.metadata?.content_type || 'note'
  const emoji = { note: '📝', article: '📄', youtube: '▶️', pdf: '📋', leetcode: '💻' }[contentType] || '📝'

  return (
    <div
      title={source.text}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full text-xs font-medium cursor-default hover:bg-indigo-100 transition-colors"
    >
      <span>{emoji}</span>
      <span className="truncate max-w-28">{title}</span>
      <span className="text-indigo-400 font-normal">{score}%</span>
    </div>
  )
}

function LoadingMessage() {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <span className="text-indigo-600 text-xs font-bold">E</span>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-md px-4 py-3.5 shadow-sm">
          <div className="flex gap-1.5 items-center">
            <span className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

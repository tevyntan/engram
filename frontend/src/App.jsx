import { useState } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import ChatPage from './pages/ChatPage.jsx'
import FeedPage from './pages/FeedPage.jsx'
import LibraryPage from './pages/LibraryPage.jsx'
import FlashcardsPage from './pages/FlashcardsPage.jsx'
import KeyConceptsPage from './pages/KeyConceptsPage.jsx'

export default function App() {
  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId] = useState(null)
  const navigate = useNavigate()

  function createNewConversation() {
    const id = Date.now().toString()
    const conv = { id, title: 'New Chat', messages: [] }
    setConversations(prev => [conv, ...prev])
    setActiveConvId(id)
    navigate('/')
    return id
  }

  function updateConversation(id, updater) {
    setConversations(prev => prev.map(c => c.id === id ? updater(c) : c))
  }

  const activeConv = conversations.find(c => c.id === activeConvId) || null

  return (
    <div className="flex h-full bg-gray-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-slate-100 border-r border-slate-200 flex flex-col">
        {/* Brand */}
        <div className="px-4 py-5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <img src="/Engram-Logo.png" alt="Engram logo" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
            <span className="font-semibold text-slate-800 text-base tracking-tight">Engram</span>
          </div>
          <p className="text-xs text-slate-400 mt-1 ml-9.5">Personal Memory Engine</p>
        </div>

        {/* Navigation */}
        <nav className="px-3 pt-3 space-y-0.5">
          {[
            { to: '/', label: 'Chat', icon: <ChatIcon /> },
            { to: '/feed', label: 'Feed', icon: <FeedIcon /> },
            { to: '/library', label: 'Library', icon: <LibraryIcon /> },
            { to: '/flashcards', label: 'Flashcards', icon: <FlashcardsIcon /> },
            { to: '/concepts', label: 'Key Concepts', icon: <ConceptsIcon /> },
          ].map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`
              }
            >
              {icon} {label}
            </NavLink>
          ))}
        </nav>

        {/* New Chat + history */}
        <div className="px-3 pt-4 flex-1 overflow-hidden flex flex-col gap-3">
          <button
            onClick={createNewConversation}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-indigo-600 border border-indigo-200 bg-white hover:bg-indigo-50 transition-colors"
          >
            <PlusIcon /> New Chat
          </button>

          {conversations.length > 0 && (
            <div className="overflow-y-auto flex-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1 mb-2">Recent</p>
              <div className="space-y-0.5">
                {conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => { setActiveConvId(conv.id); navigate('/') }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors ${
                      conv.id === activeConvId
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {conv.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-hidden">
        <Routes>
          <Route
            path="/"
            element={
              <ChatPage
                conversation={activeConv}
                onNewConversation={createNewConversation}
                onUpdateConversation={updateConversation}
              />
            }
          />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/flashcards" element={<FlashcardsPage />} />
          <Route path="/concepts" element={<KeyConceptsPage />} />
        </Routes>
      </main>
    </div>
  )
}

function ChatIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  )
}

function FeedIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function LibraryIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
    </svg>
  )
}

function FlashcardsIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  )
}

function ConceptsIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}
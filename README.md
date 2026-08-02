# Engram

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![LangChain](https://img.shields.io/badge/LangChain-1C3C3C?logo=langchain&logoColor=white)](https://www.langchain.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-1C3C3C?logo=langgraph&logoColor=white)](https://www.langchain.com/langgraph)
[![Qdrant](https://img.shields.io/badge/Qdrant-DC244C?logo=qdrant&logoColor=white)](https://qdrant.tech/)
[![OpenAI](https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white)](https://openai.com/)
[![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com/)
[![Railway](https://img.shields.io/badge/Railway-0B0D0E?logo=railway&logoColor=white)](https://railway.app/)

**Live demo:** [engram-livid.vercel.app](https://engram-livid.vercel.app/)

Engram is a personal memory engine and AI study assistant. You feed it anything you learn — lecture notes, PDFs, YouTube videos, articles, your own scratch notes — and get it back later by just asking a question in plain language. Under the hood it's a corrective RAG agent built on LangGraph that does hybrid vector search over your own content, and it can also turn what you've ingested into flashcards and structured study guides. It's built for students and self-learners who accumulate a pile of scattered material over a semester and want one place to actually query it.

---

## Features

### Multi-format ingestion
- Paste raw text directly
- Upload PDFs and Word documents, including bulk upload with per-file progress
- Web article URLs, auto-scraped
- YouTube URLs, transcript extracted automatically
- Auto-tagging: `gpt-4o-mini` generates 3-6 topic tags per document at ingest time
- Collection grouping to organize documents by module or topic (e.g. `cs2109`)

### Intelligent retrieval
- Hybrid search: dense vectors (`text-embedding-3-small`, 1536-dim, cosine) fused with sparse BM25 (FastEmbed) via Reciprocal Rank Fusion
- Corrective RAG: automatic query rewriting when retrieval quality grades as poor
- Metadata filtering by content type, collection, and tags
- Multi-turn conversation memory, with history passed to every agent node
- Streaming responses via FastAPI SSE and the browser `ReadableStream` API

### Study features
- Flashcard generation: select any documents, generate up to 12 Anki-style flip cards using structured outputs
- Key Concepts: generate a structured markdown study guide from selected documents, with follow-up streaming chat grounded in your notes
- Filter by content type, collection, or tag when selecting study material

### Library management
- View all ingested documents with metadata, tags, collection, chunk count, and ingest date
- Search and filter by title, content type, tag, or collection
- Delete individual memories

### Evaluation pipeline (`eval.py`)
- Synthetically generates test questions from stored chunks using `gpt-4o-mini` — no labeled test data needed
- Runs each question through the full LangGraph agent
- Grades retrieval success and answer quality with LLM-as-judge

### Production observability
- LangSmith tracing on every agent run
- Full visibility into every node, LLM call, token usage, latency, and structured output

---

## Architecture

```
React Frontend (Vercel)
        │
        ▼
FastAPI Backend (Railway)
        │
        ▼
LangGraph CRAG Agent
        │
        ├──▶ OpenAI API (embeddings + generation)
        ├──▶ Qdrant Cloud (hybrid vector search)
        └──▶ LangSmith (tracing)
```

### The LangGraph agent (5 nodes)

| # | Node | Description |
|---|------|-------------|
| 1 | `analyze_query` | Classifies the query as `specific`, `summary`, or `comparison` using structured outputs |
| 2 | `retrieve` | Hybrid search combining dense semantic embeddings and BM25 sparse vectors, fused with Reciprocal Rank Fusion |
| 3 | `grade_retrieval` | LLM judge grades retrieval quality as `good` or `poor` using structured outputs |
| 4 | `rewrite_query` | Rewrites poor queries and retries retrieval, capped at 2 retries to prevent infinite loops |
| 5 | `generate` | Generates a grounded answer in hybrid mode — retrieved context first, supplemented with general knowledge explicitly labeled `[General Knowledge]` |

---

## Technical highlights

- **Hybrid search** — dense OpenAI embeddings and sparse BM25 vectors are fused with Reciprocal Rank Fusion rather than relying on semantic similarity alone, which improves recall on queries with specific keywords or terminology.
- **Corrective RAG (CRAG) agent** — retrieval quality is graded before generation, and poor retrievals trigger automatic query rewriting instead of silently returning a weak answer.
- **Structured outputs everywhere** — query classification, retrieval grading, flashcard generation, and study guides all use structured (schema-validated) LLM outputs instead of parsing free text.
- **SSE streaming** — chat and study-guide follow-up responses stream token-by-token from FastAPI to the browser via Server-Sent Events and `ReadableStream`, instead of blocking on a full response.
- **LLM-as-judge evaluation** — `eval.py` synthesizes its own test questions from ingested content and grades the agent's retrieval and answers automatically, so there's no manually labeled eval set to maintain.
- **LangSmith tracing** — every node, LLM call, token count, and latency in the agent graph is traced in production, making the agent debuggable instead of a black box.

---

## Build phases

Engram was built in three phases, each preserved in its own folder in the repo to show the evolution of the system:

| Phase | Folder | Description |
|-------|--------|-------------|
| 1 — Raw | [`phase1_raw/`](phase1_raw) | Direct OpenAI + Qdrant calls, no frameworks. Establishes the baseline embed → search → generate loop. |
| 2 — LangChain | [`phase2_langchain/`](phase2_langchain) | Refactored onto LangChain abstractions, added multi-format ingestion (PDF, DOCX, YouTube, web articles). |
| 3 — LangGraph | [`phase3_langgraph/`](phase3_langgraph) | Upgraded to a stateful LangGraph agent with query analysis, hybrid retrieval, corrective grading/rewriting, and grounded generation. |

The current production app (`backend/`, `frontend/`) builds on phase 3.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Tailwind CSS, Vite — deployed on Vercel |
| Backend | FastAPI (Python) — deployed on Railway |
| Vector DB | Qdrant Cloud (hybrid dense + sparse search) |
| LLM + Embeddings | OpenAI API (`gpt-4o-mini`, `text-embedding-3-small`) |
| Agent framework | LangChain, LangGraph |
| Observability | LangSmith |
| Local dev | Docker (Qdrant) |

---

## Getting started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker Desktop

### Environment variables

```
OPENAI_API_KEY=
QDRANT_URL=
QDRANT_API_KEY=
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=engram
VITE_API_URL=          # frontend only
```

### Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Qdrant locally (optional)

If you'd rather not use Qdrant Cloud during local development, spin up Qdrant with Docker instead:

```bash
docker compose up -d
```

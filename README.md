# Engram

**A personal memory engine powered by RAG**

Engram is an AI-powered chatbot that lets you feed in anything you learn — notes, LeetCode solutions, articles, PDFs, YouTube transcripts — and retrieve it later by asking questions naturally in a chat interface. It uses Retrieval-Augmented Generation (RAG) to search your personal knowledge base and return contextually relevant answers powered by OpenAI.

---

## Phases

| Phase | Name | Description |
|-------|------|-------------|
| 1 | Raw RAG | Direct embedding + vector search with Qdrant and OpenAI |
| 2 | LangChain + Multi-Format | Multi-format ingestion (PDF, DOCX, YouTube, web) via LangChain |
| 3 | LangGraph Agent | Agentic memory with planning, routing, and tool use via LangGraph |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, Tailwind CSS, Vite |
| Backend | FastAPI, Python |
| AI / RAG | OpenAI, LangChain, LangGraph |
| Vector DB | Qdrant |
| Infrastructure | Docker, Docker Compose |

---

## Running Locally

### 1. Start Qdrant (vector database)

```bash
docker compose up -d
```

Qdrant will be available at `http://localhost:6333`.

### 2. Start the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs at `http://localhost:8000`. Health check: `GET /health`.

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```
OPENAI_API_KEY=your_key_here
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

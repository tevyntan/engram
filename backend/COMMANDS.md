# Engram — Commands Reference

## 1. Docker (Qdrant)

Start Qdrant (must be running before the backend):

```bash
docker-compose up -d
```

Stop Qdrant:

```bash
docker-compose down
```

Check Qdrant is running:

```bash
docker ps
```

Qdrant dashboard: http://localhost:6333/dashboard

---

## 2. Backend (FastAPI)

Navigate to the phase you want to run:

```bash
# Phase 1
cd phase1_raw

# Phase 2 (LangChain)
cd phase2_langchain
```

Install dependencies (first time only):

```bash
pip install -r ../backend/requirements.txt
```

Start the server:

```bash
uvicorn main:app --reload --port 8000
```

API base URL: http://localhost:8000

Interactive API docs: http://localhost:8000/docs

---

## 3. Frontend (React)

```bash
cd frontend
```

Install dependencies (first time only):

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Frontend URL: http://localhost:3000

---

## Startup Order

Always start in this order:

1. Docker (Qdrant)
2. Backend
3. Frontend

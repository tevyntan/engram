from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ingest import ingest
from retrieve import retrieve

app = FastAPI(title="Engram API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class IngestRequest(BaseModel):
    text: str
    title: str
    content_type: str = "note"

class IngestResponse(BaseModel):
    chunks_ingested: int
    title: str
    content_type: str

class ChatRequest(BaseModel):
    question: str

class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/ingest", response_model=IngestResponse)
def ingest_endpoint(body: IngestRequest):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    
    result = ingest(
        text=body.text,
        metadata={
            "title": body.title,
            "content_type": body.content_type
        }
    )
    return IngestResponse(
        chunks_ingested=result["chunks_ingested"],
        title=body.title,
        content_type=body.content_type
    )

@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(body: ChatRequest):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="question field cannot be empty")

    result = retrieve(question=body.question)

    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"]
    )
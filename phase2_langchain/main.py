import os
import tempfile
from typing import Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ingest import ingest_text, ingest_file, ingest_url
from backend.retrieve import retrieve

app = FastAPI(title="Engram API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPORTED_EXTENSIONS = {".pdf", ".doc", ".docx"}

class IngestTextRequest(BaseModel):
    text: str
    title: str
    content_type: str = "note"

class IngestURLRequest(BaseModel):
    url: str
    title: str
    content_type: str = "article"

class IngestResponse(BaseModel):
    chunks_ingested: int
    title: str
    content_type: str

class ChatRequest(BaseModel):
    question: str
    filter_type: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/ingest/text", response_model=IngestResponse)
def ingest_text_endpoint(body: IngestTextRequest):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    
    result = ingest_text(
        text=body.text,
        title=body.title,
        content_type=body.content_type
    )
    return IngestResponse(
        chunks_ingested=result["chunks_ingested"],
        title = body.title,
        content_type=body.content_type
    )

@app.post("/ingest/file", response_model=IngestResponse)
async def ingest_file_endpoint(
    file: UploadFile = File(...),
    title: str = Form(...),
    content_type: str = Form("document")
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Supported: {', '.join(SUPPORTED_EXTENSIONS)}"
        )
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(await file.read())
    tmp_path = tmp.name

    try:
        result = ingest_file(
            file_path=tmp_path,
            title=title,
            content_type=content_type
        )
    finally:
        os.unlink(tmp_pth)
    
    return IngestResponse(
        chunks_ingested=result["chunks_ingested"],
        title=title,
        content_type=content_type
    )

@app.post("/ingest/url", response_model=IngestResponse)
def ingest_url_endpoint(body: IngestURLRequest):

    if not body.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty.")

    result = ingest_url(
        url=body.url,
        title=body.title,
        content_type=body.content_type
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

    result = retrieve(
        question=body.question,
        filter_type=body.filter_type
    )

    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"]
    )
 




import os
import tempfile
from collections import defaultdict
from typing import Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ingest import ingest_text, ingest_file, ingest_url, qdrant_client, COLLECTION_NAME
from retrieve import retrieve

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

class LibraryItem(BaseModel):
    title: str
    content_type: str
    source: str
    chunks: int
    date_ingested: Optional[str] = None

class LibraryResponse(BaseModel):
    items: list[LibraryItem]
    total: int

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
        os.unlink(tmp_path)
    
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

@app.get("/library", response_model=LibraryResponse)
def library_endpoint():
    try:
        collections = [c.name for c in qdrant_client.get_collections().collections]
        if COLLECTION_NAME not in collections:
            return LibraryResponse(items=[], total=0)

        groups = defaultdict(lambda: {
            "content_type": "",
            "source": "",
            "chunks": 0,
            "date_ingested": None,
        })

        offset = None
        while True:
            batch, offset = qdrant_client.scroll(
                collection_name=COLLECTION_NAME,
                limit=250,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )
            for point in batch:
                meta = (point.payload or {}).get("metadata", {})
                title = meta.get("title") or "Untitled"
                groups[title]["content_type"] = meta.get("content_type", "")
                groups[title]["source"]       = meta.get("source", "")
                groups[title]["date_ingested"] = meta.get("date_ingested", None)
                groups[title]["chunks"]       += 1
            if offset is None:
                break

        items = [
            LibraryItem(
                title=title,
                content_type=g["content_type"],
                source=g["source"],
                chunks=g["chunks"],
                date_ingested=g["date_ingested"],
            )
            for title, g in sorted(groups.items(), key=lambda x: x[0].lower())
        ]
        return LibraryResponse(items=items, total=len(items))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
 




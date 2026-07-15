import os
import tempfile
import json
from collections import defaultdict
from typing import Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from qdrant_client.models import Filter, FieldCondition, MatchValue, FilterSelector

from ingest import ingest_text, ingest_file, ingest_url, ensure_payload_indexes, qdrant_client, COLLECTION_NAME
from agent import run_agent, stream_agent

app = FastAPI(title="Engram API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://engram-livid.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPORTED_EXTENSIONS = {".pdf", ".doc", ".docx"}
MAX_FLASHCARDS = 12

class IngestTextRequest(BaseModel):
    text: str
    title: str
    content_type: str = "note"
    collection: Optional[str] = None

class IngestURLRequest(BaseModel):
    url: str
    title: str
    content_type: str = "article"
    collection: Optional[str] = None

class IngestResponse(BaseModel):
    chunks_ingested: int
    title: str
    content_type: str

class ChatRequest(BaseModel):
    question: str
    filter_type: Optional[str] = None
    collection: Optional[str] = None
    chat_history: list[dict] = []

class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]
    query_type: str
    retrieval_grade: str
    was_rewritten: bool


class LibraryItem(BaseModel):
    title: str
    content_type: str
    source: str
    chunks: int
    date_ingested: Optional[str] = None
    tags: list[str] = []
    collection: Optional[str] = None

class LibraryResponse(BaseModel):
    items: list[LibraryItem]
    total: int

# ── Study feature models ───────────────────────────────────────────────────────

class Flashcard(BaseModel):
    question: str
    answer: str

class FlashcardSet(BaseModel):
    flashcards: list[Flashcard]

class FlashcardsRequest(BaseModel):
    titles: list[str]
    num_cards: int = 5

class FlashcardsResponse(BaseModel):
    flashcards: list[Flashcard]
    titles_used: list[str]
    total_cards: int

class ConceptsRequest(BaseModel):
    titles: list[str]

class ConceptsResponse(BaseModel):
    summary: str
    context: str
    titles_used: list[str]

class ConceptsChatRequest(BaseModel):
    question: str
    context: str
    chat_history: list[dict] = []

# ── LLMs for study features ────────────────────────────────────────────────────

study_llm = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0.3,
    api_key=os.getenv("OPENAI_API_KEY"),
)

study_streaming_llm = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0.3,
    api_key=os.getenv("OPENAI_API_KEY"),
    streaming=True,
)

# ── Shared helper ──────────────────────────────────────────────────────────────

def _fetch_chunks_for_titles(titles: list[str]) -> str:
    title_filter = Filter(
        should=[
            FieldCondition(key="metadata.title", match=MatchValue(value=t))
            for t in titles
        ]
    )
    texts = []
    offset = None
    while True:
        batch, offset = qdrant_client.scroll(
            collection_name=COLLECTION_NAME,
            scroll_filter=title_filter,
            limit=250,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )
        for point in batch:
            content = (point.payload or {}).get("page_content", "")
            if content:
                texts.append(content)
        if offset is None:
            break
    return "\n\n---\n\n".join(texts)

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/ingest/text", response_model=IngestResponse)
def ingest_text_endpoint(body: IngestTextRequest):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    
    try:
        result = ingest_text(
            text=body.text,
            title=body.title,
            content_type=body.content_type,
            collection=body.collection or None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return IngestResponse(
        chunks_ingested=result["chunks_ingested"],
        title = body.title,
        content_type=body.content_type
    )

@app.post("/ingest/file", response_model=IngestResponse)
async def ingest_file_endpoint(
    file: UploadFile = File(...),
    title: str = Form(...),
    content_type: str = Form("document"),
    collection: Optional[str] = Form(None),
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
            content_type=content_type,
            collection=collection or None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
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

    try:
        result = ingest_url(
            url=body.url,
            title=body.title,
            content_type=body.content_type,
            collection=body.collection or None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
            "tags": [],
            "collection": None,
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
                if not groups[title]["tags"] and meta.get("tags"):
                    groups[title]["tags"] = meta.get("tags")
                if not groups[title]["collection"] and meta.get("collection"):
                    groups[title]["collection"] = meta.get("collection")
            if offset is None:
                break

        items = [
            LibraryItem(
                title=title,
                content_type=g["content_type"],
                source=g["source"],
                chunks=g["chunks"],
                date_ingested=g["date_ingested"],
                tags=g["tags"],
                collection=g["collection"],
            )
            for title, g in sorted(groups.items(), key=lambda x: x[0].lower())
        ]
        return LibraryResponse(items=items, total=len(items))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/library/{title}")
def delete_library_item(title: str):
    try:
        ensure_payload_indexes()

        title_filter = Filter(
            must=[
                FieldCondition(
                    key="metadata.title",
                    match=MatchValue(value=title)
                )
            ]
        )

        count_result = qdrant_client.count(
            collection_name=COLLECTION_NAME,
            count_filter=title_filter,
            exact=True,
        )
        points_deleted = count_result.count

        if points_deleted == 0:
            return {"deleted": False, "title": title, "points_deleted": 0}

        qdrant_client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=FilterSelector(filter=title_filter),
        )

        return {"deleted": True, "title": title, "points_deleted": points_deleted}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(body: ChatRequest):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="question field cannot be empty")

    try:
        result = run_agent(
            question=body.question,
            filter_type=body.filter_type,
            collection=body.collection,
            chat_history=body.chat_history,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"],
        query_type=result["query_type"],
        retrieval_grade=result["retrieval_grade"],
        was_rewritten=result["was_rewritten"],
    )

def _sse_generator(question: str, filter_type: str | None, collection: str | None, chat_history: list[dict]):
    try:
        for event_type, payload in stream_agent(question, filter_type, collection, chat_history):
            if event_type == "token":
                data = json.dumps({"type": "token", "content": payload})
            else:
                data = json.dumps({"type": "done", **payload})
            yield f"data: {data}\n\n"
    except Exception as e:
        error_data = json.dumps({"type": "error", "detail": str(e)})
        yield f"data: {error_data}\n\n"

@app.post("/chat/stream")
def chat_stream_endpoint(body: ChatRequest):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="question field cannot be empty")

    return StreamingResponse(
        _sse_generator(body.question, body.filter_type, body.collection, body.chat_history),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )

# ── Study endpoints ────────────────────────────────────────────────────────────

@app.get("/library/titles")
def library_titles_endpoint():
    try:
        existing = [c.name for c in qdrant_client.get_collections().collections]
        if COLLECTION_NAME not in existing:
            return {"titles": []}

        seen = {}
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
                if title not in seen:
                    seen[title] = {
                        "title": title,
                        "content_type": meta.get("content_type", ""),
                        "collection": meta.get("collection"),
                        "tags": meta.get("tags", []),
                    }
            if offset is None:
                break

        return {"titles": sorted(seen.values(), key=lambda x: x["title"].lower())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/flashcards", response_model=FlashcardsResponse)
def flashcards_endpoint(body: FlashcardsRequest):
    if not body.titles:
        raise HTTPException(status_code=400, detail="titles cannot be empty")

    num_cards = min(body.num_cards, MAX_FLASHCARDS)

    try:
        context = _fetch_chunks_for_titles(body.titles)
        if not context.strip():
            raise HTTPException(status_code=404, detail="No content found for the given titles")

        prompt = ChatPromptTemplate.from_template("""
You are a study assistant. Generate exactly {num_cards} flashcards from the content below.

Rules:
- Questions must be specific and testable, not vague
- Answers must be concise: 1-3 sentences
- Cover the most important concepts across all the material
- Do not repeat similar questions

CONTENT:
{context}

Generate exactly {num_cards} flashcards.
""")
        structured_llm = study_llm.with_structured_output(FlashcardSet)
        chain = prompt | structured_llm
        result = chain.invoke({"context": context, "num_cards": num_cards})

        return FlashcardsResponse(
            flashcards=result.flashcards,
            titles_used=body.titles,
            total_cards=len(result.flashcards),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/concepts", response_model=ConceptsResponse)
def concepts_endpoint(body: ConceptsRequest):
    if not body.titles:
        raise HTTPException(status_code=400, detail="titles cannot be empty")

    try:
        context = _fetch_chunks_for_titles(body.titles)
        if not context.strip():
            raise HTTPException(status_code=404, detail="No content found for the given titles")

        prompt = ChatPromptTemplate.from_template("""
You are a study assistant. Generate a structured study guide from the content below.

Format your response as markdown:
- A brief overview paragraph
- Numbered sections, one per major concept — each with a title, explanation, and why it matters
- A summary section at the end listing key takeaways

CONTENT:
{context}
""")
        chain = prompt | study_llm | StrOutputParser()
        summary = chain.invoke({"context": context})

        return ConceptsResponse(
            summary=summary,
            context=context,
            titles_used=body.titles,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _concepts_chat_sse(question: str, context: str, chat_history: list[dict]):
    history_text = "\n".join(
        f"{'User' if m.get('role') == 'user' else 'Assistant'}: {m.get('content', '')}"
        for m in chat_history
    ) or "(no previous messages)"

    prompt = ChatPromptTemplate.from_template("""
You are a study assistant. Answer the user's question using the study material below as your primary source.
If the material fully answers the question, base your answer on it alone.
If you need to supplement with general knowledge, label those parts with [General Knowledge].

STUDY MATERIAL:
{context}

CONVERSATION HISTORY:
{chat_history}

QUESTION:
{question}

ANSWER:""")

    prompt_value = prompt.format_prompt(
        context=context,
        chat_history=history_text,
        question=question,
    )

    try:
        for chunk in study_streaming_llm.stream(prompt_value):
            if chunk.content:
                yield f"data: {json.dumps({'type': 'token', 'content': chunk.content})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'detail': str(e)})}\n\n"


@app.post("/concepts/chat/stream")
def concepts_chat_stream_endpoint(body: ConceptsChatRequest):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="question cannot be empty")
    if not body.context.strip():
        raise HTTPException(status_code=400, detail="context cannot be empty")

    return StreamingResponse(
        _concepts_chat_sse(body.question, body.context, body.chat_history),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


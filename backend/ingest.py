import os
from datetime import datetime, timezone
from dotenv import load_dotenv

from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_qdrant import QdrantVectorStore, FastEmbedSparse, RetrievalMode
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from langchain_community.document_loaders import PyPDFLoader
from langchain_community.document_loaders import Docx2txtLoader
from langchain_community.document_loaders import WebBaseLoader
from langchain_community.document_loaders import YoutubeLoader

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, SparseVectorParams, SparseIndexParams, PayloadSchemaType

load_dotenv()

QDRANT_HOST     = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT     = int(os.getenv("QDRANT_PORT", 6333))
COLLECTION_NAME = "engram"
EMBEDDING_MODEL = "text-embedding-3-small"
TAG_MODEL      = "gpt-4o-mini"
TAG_CHAR_LIMIT = 1000
VECTOR_SIZE     = 1536
SPARSE_MODEL       = "Qdrant/bm25"
DENSE_VECTOR_NAME  = "dense"
SPARSE_VECTOR_NAME = "sparse"
CHUNK_SIZE      = 2000
CHUNK_OVERLAP   = 200

qdrant_client = QdrantClient(
    url=os.getenv("QDRANT_URL"),
    api_key=os.getenv("QDRANT_API_KEY"),
)

sparse_embeddings = FastEmbedSparse(model_name=SPARSE_MODEL)


embeddings = OpenAIEmbeddings(
    model=EMBEDDING_MODEL,
    api_key=os.getenv("OPENAI_API_KEY")
)

tag_llm = ChatOpenAI(
    model=TAG_MODEL,
    temperature=0.3,
    api_key=os.getenv("OPENAI_API_KEY"),
)

TAG_PROMPT = ChatPromptTemplate.from_template("""
Read the document excerpt below and generate 3 to 6 topic tags that describe
specifically what it is about.

Rules for the tags:
- lowercase only
- specific, not generic (e.g. "binary trees" not "computer science")
- 1 to 3 words each
- return ONLY a comma-separated list, nothing else (no numbering, no explanation)

DOCUMENT EXCERPT:
{text}

TAGS:""")

splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
)

def _collection_has_sparse_vectors() -> bool:
    info = qdrant_client.get_collection(COLLECTION_NAME)
    sparse_cfg = info.config.params.sparse_vectors
    return bool(sparse_cfg) and SPARSE_VECTOR_NAME in sparse_cfg

def ensure_payload_indexes():
    # Any field used inside a Qdrant Filter (e.g. metadata.title for deletes,
    # metadata.content_type for filtered retrieval) must have a payload index
    # or Qdrant rejects the filter with a 400. create_payload_index is safe to
    # call even if the index already exists.
    for field_name in ("metadata.title", "metadata.content_type", "metadata.collection"):
        try:
            qdrant_client.create_payload_index(
                collection_name=COLLECTION_NAME,
                field_name=field_name,
                field_schema=PayloadSchemaType.KEYWORD,
            )
        except Exception:
            pass  # index already exists

def ensure_collection():
    existing = [c.name for c in qdrant_client.get_collections().collections]
    
    if COLLECTION_NAME in existing:
        if _collection_has_sparse_vectors():
            ensure_payload_indexes()
            return
    
        print(
            f"[ingest] Collection '{COLLECTION_NAME}' exists without sparse "
            "vectors. Recreating it for hybrid search — you will need to "
            "re-ingest your documents."
        )
        qdrant_client.delete_collection(COLLECTION_NAME)
    qdrant_client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config={
            DENSE_VECTOR_NAME: VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE)
        },
        sparse_vectors_config={
            SPARSE_VECTOR_NAME: SparseVectorParams(
                index=SparseIndexParams(on_disk=False)
            ),
        },
    )
    ensure_payload_indexes()

def _generate_tags(text: str) -> list[str]:
    excerpt = text[:TAG_CHAR_LIMIT].strip()
    if not excerpt:
        return []

    try:
        chain = TAG_PROMPT | tag_llm | StrOutputParser()
        raw = chain.invoke({"text": excerpt})
        tags = [tag.strip().lower() for tag in raw.split(",")]
        return [tag for tag in tags if tag]
    except Exception as e:
        print(f"[ingest] Tag generation failed, continuing without tags: {e}")
        return []
    
def _ingest_documents(docs: list[Document]) -> dict:
    ensure_collection()

    chunks = splitter.split_documents(docs)

    sample_text = chunks[0].page_content if chunks else (docs[0].page_content if docs else "")
    tags = _generate_tags(sample_text)
    for chunk in chunks:
        chunk.metadata["tags"] = tags

    vector_store = QdrantVectorStore(
        client=qdrant_client,
        collection_name=COLLECTION_NAME,
        embedding=embeddings,
        sparse_embedding=sparse_embeddings,
        retrieval_mode=RetrievalMode.HYBRID,
        vector_name=DENSE_VECTOR_NAME,
        sparse_vector_name=SPARSE_VECTOR_NAME,
    )  
    
    vector_store.add_documents(chunks)

    return {"chunks_ingested": len(chunks)}

def ingest_text(text: str, title: str, content_type: str = "note", collection: str = None) -> dict:
    meta = {
        "title": title,
        "content_type": content_type,
        "source": "direct_input",
        "date_ingested": datetime.now(timezone.utc).isoformat(),
    }
    if collection:
        meta["collection"] = collection
    doc = Document(page_content=text, metadata=meta)
    return _ingest_documents([doc])

def ingest_file(file_path: str, title: str, content_type: str = "document", collection: str = None) -> dict:
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        loader = PyPDFLoader(file_path)
    elif ext in (".docx", ".doc"):
        loader = Docx2txtLoader(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    docs = loader.load()

    ingested_at = datetime.now(timezone.utc).isoformat()
    for doc in docs:
        doc.metadata.update({
            "title": title,
            "content_type": content_type,
            "source": file_path,
            "date_ingested": ingested_at,
        })
        if collection:
            doc.metadata["collection"] = collection

    return _ingest_documents(docs)

def ingest_url(url: str, title: str, content_type: str = "article", collection: str = None) -> dict:
    if "youtube.com" in url or "youtu.be" in url:
        video_id = url.split("v=")[-1].split("&")[0] if "v=" in url else url.split("/")[-1]
        loader = YoutubeLoader(video_id=video_id)
        content_type = "youtube"
    else:
        loader = WebBaseLoader(url)

    docs = loader.load()

    ingested_at = datetime.now(timezone.utc).isoformat()
    for doc in docs:
        doc.metadata.update({
            "title": title,
            "content_type": content_type,
            "source": url,
            "date_ingested": ingested_at,
        })
        if collection:
            doc.metadata["collection"] = collection

    return _ingest_documents(docs)
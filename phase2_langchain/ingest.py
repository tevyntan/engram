import os
from datetime import datetime, timezone
from dotenv import load_dotenv

from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

from langchain_community.document_loaders import PyPDFLoader
from langchain_community.document_loaders import Docx2txtLoader
from langchain_community.document_loaders import WebBaseLoader
from langchain_community.document_loaders import YoutubeLoader

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

load_dotenv()

QDRANT_HOST     = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT     = int(os.getenv("QDRANT_PORT", 6333))
COLLECTION_NAME = "engram"
EMBEDDING_MODEL = "text-embedding-3-small"
VECTOR_SIZE     = 1536
CHUNK_SIZE      = 2000
CHUNK_OVERLAP   = 200

qdrant_client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

embeddings = OpenAIEmbeddings(
    model=EMBEDDING_MODEL,
    api_key=os.getenv("OPENAI_API_KEY")
)

splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
)

def ensure_collection():
    existing = [c.name for c in qdrant_client.get_collections().collections]
    if COLLECTION_NAME not in existing:
        qdrant_client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE)
        )

def _ingest_documents(docs: list[Document]) -> dict:
    ensure_collection()

    chunks = splitter.split_documents(docs)

    vector_store = QdrantVectorStore(
        client=qdrant_client,
        collection_name=COLLECTION_NAME,
        embedding=embeddings,
    )  
    
    vector_store.add_documents(chunks)

    return {"chunks_ingested": len(chunks)}

def ingest_text(text: str, title: str, content_type: str = "note") -> dict:
    doc = Document(
        page_content=text,
        metadata={
            "title": title,
            "content_type": content_type,
            "source": "direct_input",
            "date_ingested": datetime.now(timezone.utc).isoformat(),
        }
    )
    return _ingest_documents([doc])

def ingest_file(file_path: str, title: str, content_type: str = "document") -> dict:
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

    return _ingest_documents(docs)

def ingest_url(url: str, title: str, content_type: str = "article") -> dict:
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

    return _ingest_documents(docs)
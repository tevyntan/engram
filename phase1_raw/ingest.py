import os
import uuid
from dotenv import load_dotenv
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
QDRANT_HOST    = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT    = int(os.getenv("QDRANT_PORT", 6333))

COLLECTION_NAME  = "engram"
EMBEDDING_MODEL  = "text-embedding-3-small"
VECTOR_SIZE      = 1536

openai_client = OpenAI(api_key=OPENAI_API_KEY)
qdrant_client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)



def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        start += chunk_size - overlap
    return chunks

def get_embedding(text: str) -> list[float]:
    response = openai_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text
    )
    return response.data[0].embedding

def ensure_collection():
    existing = [c.name for c in qdrant_client.get_collections().collections]
    if COLLECTION_NAME not in existing:
        qdrant_client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE)
        )

def ingest(text: str, metadata: dict = None):
    ensure_collection()

    chunks = chunk_text(text)
    points = []

    for chunk in chunks:
        embedding = get_embedding(chunk)
        '''
        create a PointStruct for each chunk with a unique ID,
        the embedding vector, and the associated metadata as payload. 
        The metadata can include additional information about the text chunk, 
        such as its source or context. Each point is then added to the list of 
        points to be upserted into the Qdrant collection.
        '''
        point = PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={
                "text": chunk,
                **(metadata or {})
            }
        )
        points.append(point)
    
    '''
    Upsert the list of points into the Qdrant collection.
    '''
    qdrant_client.upsert(
        collection_name=COLLECTION_NAME,
        points=points
    )   

    return {"chunks_ingested": len(chunks)}

if __name__ == "__main__":
    sample_text = "This is a test. Engram is a personal memory engine."
    result = ingest(sample_text, metadata={"source": "test"})
    print(result)
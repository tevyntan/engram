import os
from dotenv import load_dotenv
from openai import OpenAI
from qdrant_client import QdrantClient

load_dotenv()

openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
qdrant_client = QdrantClient(
    host=os.getenv("QDRANT_HOST", "localhost"),
    port=int(os.getenv("QDRANT_PORT", 6333))
)

COLLECTION_NAME = "engram"
EMBEDDING_MODEL = "text-embedding-3-small"
CHAT_MODEL      = "gpt-4o-mini"
TOP_K           = 5

def embed_query(question: str) -> list[float]:
    response = openai_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=question
    )

    return response.data[0].embedding

def search_qdrant(query_vector: list[float], top_k: int = TOP_K) -> list[dict]:
    results = qdrant_client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=top_k,
        with_payload=True
    ).points
    return [
        {
            "text": hit.payload.get("text", ""),
            "score": hit.score,
            "metadata": {k: v for k, v in hit.payload.items() if k != "text"}
        }
        for hit in results
    ]

'''
grounding the search results in a structured format, including 
the text of each chunk, its relevance score, and any associated 
metadata. This allows for a more informative and context-rich 
response when building prompts for the language model.
'''
def build_prompt(question: str, chunks: list[dict]) -> str:
    context_block = "\n\n---\n\n".join(
        f"[Source {i+1}] (relevance: {chunk['score']:.2f})\n{chunk['text']}"
        for i, chunk in enumerate(chunks)
    )
    return f"""You are Engram, a personal memory assistant.
Answer the user's question using ONLY the context provided below.
If the answer cannot be found in the context, say "I don't have that information in my memory."
Do not make up any information.

CONTEXT:
{context_block}

QUESTION:
{question}

ANSWER:"""

def retrieve(question: str, top_k: int = TOP_K) -> dict:
    query_vector = embed_query(question)

    chunks = search_qdrant(query_vector, top_k=top_k)

    if not chunks:
        return {
            "answer": "I don't have any relevant memories to answer that question.",
            "sources": []
        }

    """
    stitch the retrieved chunks and the question into a single grounded prompt string.
    """
    prompt = build_prompt(question, chunks)

    response = openai_client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[
            {"role": "user", "content": prompt}
        ],
        temperature=0.2
        
    )

    answer = response.choices[0].message.content

    return {
        "answer": answer,
        "sources": chunks

    }

if __name__ == "__main__":
    result = retrieve("What do I know about Engram?")
    print("ANSWER:", result["answer"])
    print("\nSOURCES USED:")
    for i, source in enumerate(result["sources"]):
        print(f"\n[{i+1}] Score: {source['score']:.2f}\n{source['text'][:200]}...")
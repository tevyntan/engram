import os
from dotenv import load_dotenv

from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_qdrant import QdrantVectorStore
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

load_dotenv()

QDRANT_HOST     = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT     = int(os.getenv("QDRANT_PORT", 6333))
COLLECTION_NAME = "engram"
EMBEDDING_MODEL = "text-embedding-3-small"
CHAT_MODEL      = "gpt-4o-mini"
TOP_K           = 5

qdrant_client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

embeddings = OpenAIEmbeddings(
    model=EMBEDDING_MODEL,
    api_key=os.getenv("OPENAI_API_KEY")
)

llm = ChatOpenAI(
    model=CHAT_MODEL,
    temperature=0.2,
    api_key=os.getenv("OPENAI_API_KEY")
)

PROMPT_TEMPLATE = ChatPromptTemplate.from_template("""
You are Engram, a personal memory assistant.
Answer the user's question using the context provided below as your primary source.
If the context fully answers the question, base your answer on it alone.
If the context only partially answers the question, supplement with your own general knowledge to fill the gaps — but clearly label those parts with "[General Knowledge]".
If the context contains no relevant information, start your response with "Sorry, I don't seem to have any information on that in my library. Let me try to help with what I do know:" and then answer from your own general knowledge.
Never fabricate specific personal details, dates, names, or facts that are not in the context.

CONTEXT:
{context}

QUESTION:
{question}

ANSWER:""")

parser = StrOutputParser()

def _build_qdrant_filter(filter_type: str):
    if not filter_type:
        return None
    return Filter(
        must=[
            FieldCondition(
                key="metadata.content_type",
                match=MatchValue(value=filter_type)
            )
        ]
    )

def _format_context(docs_with_scores: list) -> str:
    return "\n\n---\n\n".join(
        f"[Source {i+1}] (relevance: {score:.2f})\n{doc.page_content}"
        for i, (doc, score) in enumerate(docs_with_scores)
    )

def _format_sources(docs_with_scores: list) -> list[dict]:
    return [
        {
            "text": doc.page_content,
            "score": score,
            "metadata": doc.metadata
        }
        for doc, score in docs_with_scores
    ]

def retrieve(question: str, top_k: int = TOP_K, filter_type: str = None) -> dict:
    vector_store = QdrantVectorStore(
        client=qdrant_client,
        collection_name=COLLECTION_NAME,
        embedding=embeddings,   
    )

    qdrant_filter = _build_qdrant_filter(filter_type)

    docs_with_scores = vector_store.similarity_search_with_score(
        query=question,
        k=top_k,
        filter=qdrant_filter
    )

    if not docs_with_scores:
        return {
            "answer": "I don't have any relevant memories to answer that question.",
            "sources": []
        }
    
    context = _format_context(docs_with_scores)
    sources = _format_sources(docs_with_scores)

    chain = PROMPT_TEMPLATE | llm | parser

    answer = chain.invoke({
        "context": context,
        "question": question
    })

    return {
        "answer": answer,
        "sources": sources
    }


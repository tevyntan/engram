import os
from typing import Optional, Literal
from dotenv import load_dotenv
from typing_extensions import TypedDict
from pydantic import BaseModel
from langgraph.graph import StateGraph, END
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_qdrant import QdrantVectorStore, FastEmbedSparse, RetrievalMode
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

load_dotenv()

QDRANT_HOST     = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT     = int(os.getenv("QDRANT_PORT", 6333))
COLLECTION_NAME = "engram"
EMBEDDING_MODEL = "text-embedding-3-small"
SPARSE_MODEL       = "Qdrant/bm25"
DENSE_VECTOR_NAME  = "dense"
SPARSE_VECTOR_NAME = "sparse"
CHAT_MODEL      = "gpt-4o-mini"
TOP_K           = 5
MAX_RETRIES     = 2

TOP_K_BY_QUERY_TYPE = {
    "specific":   5,
    "summary":    8,
    "comparison": 8,
}

GENERATION_STYLE_BY_QUERY_TYPE = {
    "specific":   "Answer directly and concisely — the user wants a specific fact or memory, not a broad overview.",
    "summary":    "Structure your answer as a clear overview, using short paragraphs or bullet points to summarize the key points across the context.",
    "comparison": "Structure your answer to explicitly compare and contrast the relevant items — call out similarities and differences clearly, using bullet points if helpful.",
}

GENERATE_PROMPT = ChatPromptTemplate.from_template("""
You are Engram, a personal memory assistant.
Use the conversation history below to understand context from earlier turns (e.g. "that", "it", "the one you mentioned").
Answer the user's question using the context provided below as your primary source.
{style_instruction}
If the context fully answers the question, base your answer on it alone.
If the context only partially answers the question, supplement with your own general knowledge to fill the gaps — but clearly label those parts with "[General Knowledge]".
If the context contains no relevant information, start your response with "Sorry, 
I don't seem to have any information on that in my library. Let me try to help with what I do know:" and then answer from your own general knowledge.
Never fabricate specific personal details, dates, names, or facts that are not in the context.

CONVERSATION HISTORY:
{chat_history}
                                                   
CONTEXT:
{context}

QUESTION:
{question}

ANSWER:""")

qdrant_client = QdrantClient(
    url=os.getenv("QDRANT_URL"),
    api_key=os.getenv("QDRANT_API_KEY"),
)

sparse_embeddings = FastEmbedSparse(model_name=SPARSE_MODEL)

embeddings = OpenAIEmbeddings(
    model=EMBEDDING_MODEL,
    api_key=os.getenv("OPENAI_API_KEY")
)

llm = ChatOpenAI(
    model=CHAT_MODEL,
    temperature=0.2,
    api_key=os.getenv("OPENAI_API_KEY")
)

streaming_llm = ChatOpenAI(
    model=CHAT_MODEL,
    temperature=0.2,
    api_key=os.getenv("OPENAI_API_KEY"),
    streaming=True,
)

class QueryClassification(BaseModel):
    query_type: Literal["specific", "summary", "comparison"]
    reasoning: str  # why this classification

class RetrievalGrade(BaseModel):
    grade: Literal["good", "poor"]
    reasoning: str  # why this grade

class AgentState(TypedDict):
    question:           str
    query_type:         str
    rewritten_question: Optional[str]
    chunks:             list
    retrieval_grade:    str
    answer:             str
    sources:            list
    filter_type:        Optional[str]
    collection:         Optional[str]
    retry_count:        int
    chat_history: list[dict]

def _build_qdrant_filter(filter_type: str, collection: str = None):
    conditions = []
    if filter_type:
        conditions.append(FieldCondition(key="metadata.content_type", match=MatchValue(value=filter_type)))
    if collection:
        conditions.append(FieldCondition(key="metadata.collection", match=MatchValue(value=collection)))
    if not conditions:
        return None
    return Filter(must=conditions)

def _format_context(chunks: list) -> str:
    return "\n\n---\n\n".join(
        f"[Source {i+1}] (relevance: {score:.2f})\n{doc.page_content}"
        for i, (doc, score) in enumerate(chunks)
    )


def _format_chat_history(chat_history: Optional[list[dict]]) -> str:
    if not chat_history:
        return "(no previous messages)"
    lines = []
    for msg in chat_history:
        role = "User" if msg.get("role") == "user" else "Assistant"
        lines.append(f"{role}: {msg.get('content', '')}")
    return "\n".join(lines)

def _format_sources(chunks: list) -> list[dict]:
    return [
        {
            "text": doc.page_content,
            "score": score,
            "metadata": doc.metadata
        }
        for doc, score in chunks
    ]

def analyze_query(state: AgentState) -> dict:
    history = _format_chat_history(state.get("chat_history"))
    prompt = ChatPromptTemplate.from_template("""
You are analyzing a user query for a personal memory engine.
Use the conversation history to understand follow-up questions that refer back to earlier turns (e.g. "tell me more about that", "what about the other one").
Classify the query into exactly one of these types:
- "specific": the user is looking for a specific memory, fact, or piece of information
- "summary": the user wants a summary or overview of a topic
- "comparison": the user wants to compare or contrast multiple things

Classify the query and briefly explain your reasoning.
                                              
CONVERSATION HISTORY:
{chat_history}

Query: {question}
""")
    structured_llm = llm.with_structured_output(QueryClassification)
    chain = prompt | structured_llm
    result = chain.invoke({
        "question": state["question"],
        "chat_history": history,
        })
    query_type = result.query_type
    print(f"[agent] Query type: {result.query_type} — {result.reasoning}")
    return {"query_type": query_type}

def retrieve_chunks(state: AgentState) -> dict:
    query = state.get("rewritten_question") or state["question"]
    vector_store = QdrantVectorStore(
        client=qdrant_client,
        collection_name=COLLECTION_NAME,
        embedding=embeddings,
        sparse_embedding=sparse_embeddings,
        retrieval_mode=RetrievalMode.HYBRID,
        vector_name=DENSE_VECTOR_NAME,
        sparse_vector_name=SPARSE_VECTOR_NAME,
    )
    qdrant_filter = _build_qdrant_filter(state.get("filter_type"), state.get("collection"))
    k = TOP_K_BY_QUERY_TYPE.get(state.get("query_type"), TOP_K)
    chunks = vector_store.similarity_search_with_score(
        query=query,
        k=k,
        filter=qdrant_filter,
    )
    return {"chunks": chunks}

def grade_retrieval(state: AgentState) -> dict:
    if not state["chunks"]:
        return {"retrieval_grade": "poor"}

    context = _format_context(state["chunks"])
    prompt = ChatPromptTemplate.from_template("""
You are grading whether retrieved document chunks are relevant to a user question.

- "good": the chunks contain information that meaningfully helps answer the question
- "poor": the chunks are off-topic, too vague, or clearly do not address the question

Classify the retrieval and briefly explain your reasoning.
                                              
Question: {question}

Retrieved chunks:
{context}
""")
    structured_llm = llm.with_structured_output(RetrievalGrade)
    chain = prompt | structured_llm
    result = chain.invoke({
        "question": state["question"],
        "context": context,
    })
    grade = result.grade
    print(f"[agent] Retrieval grade: {result.grade} — {result.reasoning}")
    return {"retrieval_grade": grade}

def rewrite_query(state: AgentState) -> dict:
    history = _format_chat_history(state.get("chat_history"))
    prompt = ChatPromptTemplate.from_template("""
A vector search using the query below returned poor results.
Use the conversation history to resolve vague follow-up queries like "tell me more" or "explain that further" into a concrete, standalone search query.
Rewrite the query to be more specific and likely to match relevant documents.
Reply with ONLY the rewritten query, nothing else.
                                              
CONVERSATION HISTORY:
{chat_history}

Original query: {question}
""")
    chain = prompt | llm | StrOutputParser()
    rewritten = chain.invoke({
        "question": state["question"],
        "chat_history": history,
        }).strip()
    return {
        "rewritten_question": rewritten,
        "retry_count": state.get("retry_count", 0) + 1,
    }

def generate(state: AgentState) -> dict:
    history = _format_chat_history(state.get("chat_history"))
    style_instruction = GENERATION_STYLE_BY_QUERY_TYPE.get(
        state.get("query_type"), GENERATION_STYLE_BY_QUERY_TYPE["specific"]
    )

    if not state["chunks"]:
        return {
            "answer": "Sorry, I don't seem to have any information on that in my library. Let me try to help with what I do know: I wasn't able to find any relevant memories for your question.",
            "sources": [],
        }

    context = _format_context(state["chunks"])
    sources = _format_sources(state["chunks"])

    chain = GENERATE_PROMPT | llm | StrOutputParser()
    answer = chain.invoke({
        "context": context,
        "question": state.get("rewritten_question") or state["question"],
        "chat_history": history,
        "style_instruction": style_instruction,
    })
    return {"answer": answer, "sources": sources}

def route_after_grading(state: AgentState) -> str:
    if state["retrieval_grade"] == "good":
        return "generate"
    if state.get("retry_count", 0) >= MAX_RETRIES:
        return "generate"
    return "rewrite_query"

def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("analyze_query",   analyze_query)
    graph.add_node("retrieve",        retrieve_chunks)
    graph.add_node("grade_retrieval", grade_retrieval)
    graph.add_node("rewrite_query",   rewrite_query)
    graph.add_node("generate",        generate)

    graph.set_entry_point("analyze_query")

    graph.add_edge("analyze_query",   "retrieve")
    graph.add_edge("retrieve",        "grade_retrieval")
    graph.add_edge("rewrite_query",   "retrieve")
    graph.add_edge("generate",        END)

    graph.add_conditional_edges(
        "grade_retrieval",
        route_after_grading,
        {
            "generate":      "generate",
            "rewrite_query": "rewrite_query",
        }
    )

    return graph.compile()

agent = build_graph()

def run_agent(question: str, filter_type: str = None, collection: str = None, chat_history: list[dict] = None) -> dict:
    initial_state = {
        "question":           question,
        "query_type":         "",
        "rewritten_question": None,
        "chunks":             [],
        "retrieval_grade":    "",
        "answer":             "",
        "sources":            [],
        "filter_type":        filter_type,
        "collection":         collection,
        "retry_count":        0,
        "chat_history":       chat_history or [],
    }
    final_state = agent.invoke(initial_state)
    return {
        "answer":          final_state["answer"],
        "sources":         final_state["sources"],
        "query_type":      final_state["query_type"],
        "retrieval_grade": final_state["retrieval_grade"],
        "was_rewritten":   final_state.get("rewritten_question") is not None,
    }

def stream_agent(question: str, filter_type: str = None, collection: str = None, chat_history: list[dict] = None):
    """
    Runs the same graph logic as run_agent(), but yields (event_type, payload)
    tuples so the caller can format them as SSE. The generation step streams
    tokens one at a time instead of returning a single string.
    """

    state: AgentState = {
    "question":           question,
    "query_type":         "",
    "rewritten_question": None,
    "chunks":             [],
    "retrieval_grade":    "",
    "answer":             "",
    "sources":            [],
    "filter_type":        filter_type,
    "collection":         collection,
    "retry_count":        0,
    "chat_history":       chat_history or [],
    }

    state.update(analyze_query(state))
    state.update(retrieve_chunks(state))
    state.update(grade_retrieval(state))

    while route_after_grading(state) == "rewrite_query":
        state.update(rewrite_query(state))
        state.update(retrieve_chunks(state))
        state.update(grade_retrieval(state))


    if not state["chunks"]:
        fallback = (
            "Sorry, I don't seem to have any information on that in my library. "
            "Let me try to help with what I do know: I wasn't able to find any "
            "relevant memories for your question."
        )
        for word in fallback.split(" "):
            yield ("token", word + " ")
        sources = []
    else:
        context = _format_context(state["chunks"])
        sources = _format_sources(state["chunks"])
        history = _format_chat_history(state.get("chat_history"))
        style_instruction = GENERATION_STYLE_BY_QUERY_TYPE.get(
            state.get("query_type"), GENERATION_STYLE_BY_QUERY_TYPE["specific"]
        )
        prompt_value = GENERATE_PROMPT.format_prompt(
        context=context,
        question=state.get("rewritten_question") or state["question"],
        chat_history=history,
        style_instruction=style_instruction,
        )
        for chunk in streaming_llm.stream(prompt_value):
            if chunk.content:
                yield ("token", chunk.content)

    yield ("done", {
            "sources":         sources,
            "query_type":      state["query_type"],
            "retrieval_grade": state["retrieval_grade"],
            "was_rewritten":   state.get("rewritten_question") is not None,
        })
import os
import sys
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

sys.path.insert(0, os.path.dirname(__file__))
from ingest import qdrant_client, COLLECTION_NAME
from agent import run_agent

load_dotenv()

MAX_CHUNKS      = 20
MIN_CHUNK_CHARS = 100
GRADER_MODEL    = "gpt-4o-mini"

grader_llm = ChatOpenAI(
    model=GRADER_MODEL,
    temperature=0,
    api_key=os.getenv("OPENAI_API_KEY"),
)

def pull_chunks() -> list[dict]:
    """Scroll through Qdrant and return a flat list of chunk dicts."""
    points, _ = qdrant_client.scroll(
        collection_name=COLLECTION_NAME,
        limit=MAX_CHUNKS,
        with_payload=True,
        with_vectors=False,
    )

    chunks = []
    for point in points:
        payload  = point.payload or {}
        text     = payload.get("page_content", "")
        metadata = payload.get("metadata", {})

        if len(text) < MIN_CHUNK_CHARS:
            continue

        chunks.append({"text": text, "metadata": metadata})

    return chunks

def generate_question(chunk_text: str) -> str:
    """Use gpt-4o-mini to generate one realistic question for a chunk."""
    prompt = ChatPromptTemplate.from_template("""
You are generating evaluation questions for a personal memory assistant.
Read the text below and write exactly ONE natural question that this text would answer.
The question should sound like something a real user would type — conversational, specific, and direct.
Reply with ONLY the question, nothing else.

Text:
{text}
""")
    chain = prompt | grader_llm | StrOutputParser()
    return chain.invoke({"text": chunk_text}).strip()


def build_test_cases(chunks: list[dict]) -> list[dict]:
    """Attach a generated question to each chunk."""
    test_cases = []
    for i, chunk in enumerate(chunks):
        print(f"  Generating question {i + 1}/{len(chunks)}...", end="\r")
        question = generate_question(chunk["text"])
        test_cases.append({
            "question":     question,
            "source_title": chunk["metadata"].get("title", "unknown"),
            "chunk_text":   chunk["text"],
            "metadata":     chunk["metadata"],
        })
    print()
    return test_cases

def run_test_cases(test_cases: list[dict]) -> list[dict]:
    """Call run_agent() for every test case and attach the results."""
    results = []
    for i, tc in enumerate(test_cases):
        print(f"  Running question {i + 1}/{len(test_cases)}...", end="\r")
        agent_output = run_agent(tc["question"])
        results.append({**tc, **agent_output})
    print()
    return results

def grade_retrieval(result: dict) -> str:
    """
    Return 'retrieved' if the original chunk's source title appears
    in any of the sources the agent actually retrieved.
    """
    source_title = result["source_title"].lower()
    for src in result.get("sources", []):
        retrieved_title = src.get("metadata", {}).get("title", "").lower()
        if source_title and source_title in retrieved_title:
            return "retrieved"
    return "not_retrieved"

def grade_answer(question: str, chunk_text: str, answer: str) -> str:
    """
    Use gpt-4o-mini to judge whether the agent's answer addresses the question
    given the ground-truth chunk text.
    Returns: 'correct', 'partial', or 'incorrect'.
    """
    prompt = ChatPromptTemplate.from_template("""
    You are grading the quality of an AI assistant's answer.

    Original source text (ground truth):
    {chunk_text}

    User question:
    {question}

    AI answer:
    {answer}

    Grade the answer using exactly one of these labels:
    - "correct": the answer clearly and accurately addresses the question based on the source text
    - "partial": the answer is related and touches on the topic but is incomplete or vague
    - "incorrect": the answer is wrong, irrelevant, or makes things up

    Reply with ONLY one word: correct, partial, or incorrect.
    """)
    chain = prompt | grader_llm | StrOutputParser()
    raw = chain.invoke({
        "chunk_text": chunk_text,
        "question":   question,
        "answer":     answer,
    }).strip().lower()
    return raw if raw in ("correct", "partial", "incorrect") else "incorrect"

def print_report(graded: list[dict]) -> None:
    sep = "─" * 70

    for i, r in enumerate(graded, 1):
        print(f"\n{sep}")
        print(f"Test {i:02d}")
        print(f"{sep}")
        print(f"  Question      : {r['question']}")
        print(f"  Source title  : {r['source_title']}")
        print(f"  Retrieval     : {r['retrieval_check']}")
        print(f"  Retrieval grade (agent): {r['retrieval_grade']}")
        print(f"  Answer quality: {r['answer_quality']}")
        print(f"  Was rewritten : {'yes' if r['was_rewritten'] else 'no'}")



def print_summary(graded: list[dict]) -> None:
    total      = len(graded)
    retrieved  = sum(1 for r in graded if r["retrieval_check"] == "retrieved")
    correct    = sum(1 for r in graded if r["answer_quality"] == "correct")
    partial    = sum(1 for r in graded if r["answer_quality"] == "partial")
    incorrect  = sum(1 for r in graded if r["answer_quality"] == "incorrect")

    retrieval_rate = (retrieved / total * 100) if total else 0
    overall_score  = (correct   / total * 100) if total else 0

    sep = "═" * 70
    print(f"\n{sep}")
    print("EVALUATION SUMMARY")
    print(sep)
    print(f"  Total questions tested : {total}")
    print(f"  Retrieval success rate : {retrieved}/{total} ({retrieval_rate:.1f}%)")
    print(f"  Answer quality")
    print(f"    Correct              : {correct}/{total}  ({correct  / total * 100:.1f}%)")
    print(f"    Partial              : {partial}/{total}  ({partial  / total * 100:.1f}%)")
    print(f"    Incorrect            : {incorrect}/{total}  ({incorrect/ total * 100:.1f}%)")
    print(f"  Overall score          : {overall_score:.1f}%")
    print(sep)

def main():
    print("\n=== Engram RAG Evaluation Pipeline ===\n")

    print("[Step 1] Pulling chunks from Qdrant...")
    chunks = pull_chunks()
    print(f"  Found {len(chunks)} usable chunks.\n")

    print("[Step 2] Generating questions from chunks...")
    test_cases = build_test_cases(chunks)
    print(f"  Generated {len(test_cases)} test questions.\n")

    print("[Step 3] Running questions through the agent...")
    results = run_test_cases(test_cases)
    print(f"  Finished {len(results)} agent runs.\n")

    print("[Steps 4 & 5] Grading retrieval and answer quality...")
    graded = []
    for r in results:
        r["retrieval_check"] = grade_retrieval(r)
        r["answer_quality"]  = grade_answer(
            question=r["question"],
            chunk_text=r["chunk_text"],
            answer=r["answer"],
        )
        graded.append(r)
    print(f"  Grading complete.\n")

    print("[Step 6] Detailed report:")
    print_report(graded)

    print("\n[Step 7] Summary:")
    print_summary(graded)


if __name__ == "__main__":
    main()
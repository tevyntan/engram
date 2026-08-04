import os
import sys
import csv
import argparse
from collections import defaultdict
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
JUDGE_MODEL     = "gpt-4o"

grader_llm = ChatOpenAI(
    model=GRADER_MODEL,
    temperature=0,
    api_key=os.getenv("OPENAI_API_KEY"),
)

judge_llm = ChatOpenAI(
    model=JUDGE_MODEL,
    temperature=0,
    api_key=os.getenv("OPENAI_API_KEY")
)

GOLDEN_CSV = os.path.join(os.path.dirname(__file__), "..", "eval", "evalset.csv")

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

def load_golden_set(path: str = GOLDEN_CSV) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def judge_answer(question: str, expected_answer: str, actual_answer: str, category: str) -> dict:
    if category == "no-context":
        prompt = ChatPromptTemplate.from_template("""
You are evaluating whether an AI assistant correctly handled a question that falls outside its knowledge base.

The correct behavior is to decline, express uncertainty, or clearly flag 
that the information is not available — rather than fabricating a confident answer.

Question asked:
{question}

AI's actual response:
{actual_answer}

Did the AI appropriately decline or flag uncertainty instead of fabricating an answer?
Reply in exactly this format, with nothing else:
PASS
<one short sentence explaining why>
""")
        raw = (prompt | judge_llm | StrOutputParser()).invoke({
            "question":      question,
            "actual_answer": actual_answer,
        }).strip()
    else:
        prompt = ChatPromptTemplate.from_template("""
You are evaluating whether an AI assistant's answer correctly conveys the key information in the expected answer.

Question:
{question}

Expected answer (ground truth):
{expected_answer}

AI's actual answer:
{actual_answer}

Does the actual answer capture the essential facts and meaning of the expected answer?
Reply in exactly this format, with nothing else:
PASS
<one short sentence explaining why>
""")
        raw = (prompt | judge_llm | StrOutputParser()).invoke({
            "question":        question,
            "expected_answer": expected_answer,
            "actual_answer":   actual_answer,
        }).strip()

    lines   = raw.splitlines()
    verdict = lines[0].strip().upper()
    reason  = lines[1].strip() if len(lines) > 1 else ""
    verdict = verdict if verdict in ("PASS", "FAIL") else "FAIL"
    return {"verdict": verdict, "reason": reason}

def run_golden_eval(csv_path: str = GOLDEN_CSV) -> None:
    rows     = load_golden_set(csv_path)
    results  = []
    prior_qa = {}

    for row in rows:
        row_id   = row["id"]
        category = row["category"]
        question = row["question"]
        expected = row["expected_answer"]

        chat_history = []
        if category == "multi-turn" and row_id.endswith("b"):
            prefix = row_id[:-1]
            if prefix in prior_qa:
                prior = prior_qa[prefix]
                chat_history = [
                    {"role": "user",      "content": prior["question"]},
                    {"role": "assistant", "content": prior["answer"]},
                ]

        print(f"  Running {row_id}...", end="\r")
        agent_out = run_agent(question, chat_history=chat_history)
        actual    = agent_out["answer"]

        if category == "multi-turn" and row_id.endswith("a"):
            prior_qa[row_id[:-1]] = {"question": question, "answer": actual}

        verdict = judge_answer(question, expected, actual, category)

        results.append({
            "id":            row_id,
            "category":      category,
            "question":      question,
            "expected":      expected,
            "actual":        actual,
            "verdict":       verdict["verdict"],
            "reason":        verdict["reason"],
            "was_rewritten": agent_out["was_rewritten"],
        })

    print()
    _print_golden_report(results)
    _print_golden_summary(results)

def _print_golden_report(results: list[dict]) -> None:
    sep = "─" * 70
    for r in results:
        print(f"\n{sep}")
        print(f"  ID        : {r['id']}  [{r['category']}]")
        print(f"  Question  : {r['question']}")
        print(f"  Expected  : {r['expected']}")
        print(f"  Actual    : {r['actual'][:200]}{'...' if len(r['actual']) > 200 else ''}")
        print(f"  Verdict   : {r['verdict']}")
        print(f"  Reason    : {r['reason']}")
        print(f"  Rewritten : {'yes' if r['was_rewritten'] else 'no'}")


def _print_golden_summary(results: list[dict]) -> None:
    by_cat     = defaultdict(list)
    for r in results:
        by_cat[r["category"]].append(r)

    total      = len(results)
    total_pass = sum(1 for r in results if r["verdict"] == "PASS")

    sep = "═" * 70
    print(f"\n{sep}")
    print("GOLDEN SET EVALUATION SUMMARY")
    print(sep)
    for cat, rows in sorted(by_cat.items()):
        passed = sum(1 for r in rows if r["verdict"] == "PASS")
        print(f"  {cat:<12} : {passed}/{len(rows)} PASS")
    print(f"  {'─' * 32}")
    print(f"  {'TOTAL':<12} : {total_pass}/{total} PASS  ({total_pass / total * 100:.1f}%)")
    print(sep)

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
    parser = argparse.ArgumentParser()
    parser.add_argument("--golden", action="store_true", help="Run golden set eval instead of auto-eval")
    args = parser.parse_args()

    if args.golden:
        print("\n=== Engram Golden Set Evaluation ===\n")
        run_golden_eval()
        return
    
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
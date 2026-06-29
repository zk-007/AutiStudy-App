"""
Subject-Specific Retrieval Logic for AutiStudy
Exact implementation from the IPYNB notebooks:
- Final_math_grade4.ipynb (RAT + Hybrid + Reranking)
- merged_comp_6_imp_last.ipynb (Hybrid + RRF + Keyword Gate)
- Merged__science_gs4.ipynb (Hybrid + RRF)
"""

import os
import re
import numpy as np
from typing import List, Dict, Optional, Tuple
from collections import Counter

import chromadb

# Try to import required libraries
try:
    from sentence_transformers import SentenceTransformer, CrossEncoder
    EMBEDDER_AVAILABLE = True
except ImportError:
    EMBEDDER_AVAILABLE = False

try:
    from rank_bm25 import BM25Okapi
    BM25_AVAILABLE = True
except ImportError:
    BM25_AVAILABLE = False

# ChromaDB location.
# The real curriculum vector store lives in `OneSharedChromaDB` with a single
# collection called `ptb_textbooks` (see Retriever_logic/*.ipynb). Older builds
# pointed at the empty `shared_chroma_db` folder, which is why retrieval
# returned nothing for the React chat. Both can be overridden via env vars so
# deployments and tests can point at any location/collection.
CHROMA_PATH = os.getenv("CHROMA_DB_PATH", "OneSharedChromaDB")
CHROMA_COLLECTION = os.getenv("CHROMA_COLLECTION", "ptb_textbooks")

# Embedding model (same as notebooks)
EMBED_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
RERANKER_MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"

# Chroma doc_id per (grade, subject) — matches OneSharedChromaDB / ptb_textbooks
GRADE_DOC_IDS: Dict[Tuple[int, str], str] = {
    (4, "Maths"): "MATH4",
    (4, "General Science"): "GS4",
    (5, "Maths"): "MATH5",
    (5, "General Science"): "GS5",
    (6, "Maths"): "MATH6",
    (6, "General Science"): "GS6",
    (6, "Computer"): "CS6",
    (7, "Maths"): "MATH7",
    (7, "General Science"): "GS7",
    (7, "Computer"): "CS7",
}

# Legacy fallbacks when grade/subject combo is unknown
_SUBJECT_DOC_FALLBACK = {
    "Maths": "MATH4",
    "General Science": "GS4",
    "Computer": "CS6",
}

_SUBJECT_ALIASES = {
    "Computer Science": "Computer",
}


def normalize_subject(subject: str) -> str:
    """Map API/quiz subject labels to the keys used in GRADE_DOC_IDS."""
    return _SUBJECT_ALIASES.get(subject, subject)


def get_doc_id_for_grade(grade: int, subject: str) -> str:
    """Resolve the ChromaDB doc_id for a student's grade and subject."""
    subject_key = normalize_subject(subject)
    doc_id = GRADE_DOC_IDS.get((grade, subject_key))
    if doc_id:
        return doc_id
    fallback = _SUBJECT_DOC_FALLBACK.get(subject_key)
    if fallback:
        print(
            f"[RAG] No doc_id for grade={grade} subject={subject!r}; "
            f"falling back to {fallback}"
        )
        return fallback
    raise ValueError(f"Unknown subject for RAG retrieval: {subject!r}")

# Grade to subjects mapping (used by ai_tutor.py)
GRADE_SUBJECTS = {
    4: ["Maths", "General Science"],
    5: ["Maths", "General Science"],
    6: ["Maths", "General Science", "Computer"],
    7: ["Maths", "General Science", "Computer"]
}

# Block type weights for Computer/Science (from merged_comp_6_imp_last.ipynb)
BLOCK_WEIGHT = {
    "DEFINITION": 1.3,
    "PROCEDURE": 1.2,
    "EXPLANATION": 1.1,
    "BODY": 1.0,
    "QUESTION": 0.9,
    "EXAMPLE": 1.0,
    "PRACTICE": 0.9,
    "RULE": 1.1,
    "GLOSSARY": 1.2,
    "CHALLENGE": 0.8,
    "WEBLINKS": 0.3
}

# BM25 indices per subject (kept in memory)
_bm25_indices = {}
_bm25_docs = {}
_bm25_ids = {}
_bm25_metas = {}


# ============================================================
# MODULE-LEVEL SINGLETONS — replace @st.cache_resource
# ============================================================
#
# Streamlit's @st.cache_resource works fine inside a Streamlit runtime but
# has two problems when called from FastAPI / uvicorn:
#
#   1. It uses Streamlit's internal threading lock, which can deadlock or
#      cause very long waits when uvicorn calls the same function from
#      multiple concurrent requests.
#   2. It may not share the cache across uvicorn worker threads the same
#      way it does across Streamlit re-runs.
#
# Plain module-level variables are the simplest, most reliable solution:
# Python guarantees that a module is imported once per interpreter process,
# so these singletons live for the lifetime of the API server — exactly
# what we want.

_embedder = None
_reranker = None
_chroma_client = None
_chroma_collection = None


def get_embedder():
    """Return the sentence-transformer embedder, loading it on first call."""
    global _embedder
    if _embedder is not None:
        return _embedder
    if not EMBEDDER_AVAILABLE:
        return None
    try:
        _embedder = SentenceTransformer(EMBED_MODEL_NAME)
        print(f"Loaded embedding model: {EMBED_MODEL_NAME}")
    except Exception as e:
        print(f"Error loading embedder: {e}")
        _embedder = None
    return _embedder


def get_reranker():
    """Return the cross-encoder reranker, loading it on first call."""
    global _reranker
    if _reranker is not None:
        return _reranker
    if not EMBEDDER_AVAILABLE:
        return None
    try:
        _reranker = CrossEncoder(RERANKER_MODEL_NAME)
        print(f"Loaded reranker: {RERANKER_MODEL_NAME}")
    except Exception as e:
        print(f"Error loading reranker: {e}")
        _reranker = None
    return _reranker


def get_chroma_client():
    """Return the ChromaDB client, connecting on first call."""
    global _chroma_client
    if _chroma_client is not None:
        return _chroma_client
    try:
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
        print(f"Connected to ChromaDB at: {CHROMA_PATH}")
    except Exception as e:
        print(f"Error connecting to ChromaDB: {e}")
        _chroma_client = None
    return _chroma_client


def get_collection(collection_name: Optional[str] = None):
    """Return the ChromaDB collection, creating/caching it on first call.

    Always uses the default collection unless *collection_name* is explicitly
    supplied. Passing a non-default name bypasses the module-level cache so
    the default singleton isn't accidentally overwritten.
    """
    global _chroma_collection
    if collection_name is None:
        collection_name = CHROMA_COLLECTION
        # Return cached default collection if available.
        if _chroma_collection is not None:
            return _chroma_collection
    client = get_chroma_client()
    if client is None:
        return None
    try:
        col = client.get_or_create_collection(
            name=collection_name,
            metadata={"description": "Educational content for grades 4-7"},
        )
        print(f"Collection '{collection_name}' ready. Total vectors: {col.count()}")
        if collection_name == CHROMA_COLLECTION:
            _chroma_collection = col
        return col
    except Exception as e:
        print(f"Error getting collection: {e}")
        return None


# ============================================================
# COMMON FUNCTIONS
# ============================================================

def tokenize(s: str) -> List[str]:
    """Tokenizer from notebooks (CELL 25)"""
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    return s.split()


def build_bm25_index(doc_id: str):
    """Build BM25 index for a subject (CELL 26B)"""
    global _bm25_indices, _bm25_docs, _bm25_ids, _bm25_metas
    
    if not BM25_AVAILABLE:
        print("BM25 not available - install rank_bm25")
        return None
    
    if doc_id in _bm25_indices:
        return _bm25_indices[doc_id]
    
    collection = get_collection()
    if not collection:
        return None
    
    try:
        # Load all docs for this subject (CELL 24)
        all_data = collection.get(
            where={"doc_id": doc_id},
            include=["documents", "metadatas"]
        )
        
        docs = all_data["documents"]
        metas = all_data["metadatas"]
        ids = all_data["ids"]
        
        if not docs:
            print(f"No documents found for doc_id={doc_id}")
            return None
        
        # Build BM25 corpus
        bm25_tokens = [tokenize(t) for t in docs]
        bm25 = BM25Okapi(bm25_tokens)
        
        _bm25_indices[doc_id] = bm25
        _bm25_docs[doc_id] = docs
        _bm25_ids[doc_id] = ids
        _bm25_metas[doc_id] = metas
        
        print(f"BM25 built for {doc_id}: {len(docs)} documents")
        return bm25
        
    except Exception as e:
        print(f"Error building BM25 index: {e}")
        return None


# ============================================================
# MATHEMATICS RETRIEVAL (from Final_math_grade4.ipynb)
# RAT + Hybrid (65% Dense + 35% BM25) + CrossEncoder Reranking
# ============================================================

def rewrite_query(q: str) -> str:
    """Query rewriter (CELL 26C)"""
    q = q.lower().strip()
    q = q.replace("plz", "please")
    q = q.replace(" n ", " and ")
    q = q.replace("?", "")
    q = re.sub(r"\s+", " ", q)
    return q


def detect_intent_math(q: str) -> str:
    """Intent detection for Math (CELL 27)"""
    q = q.lower()
    
    if any(x in q for x in ["solve", "find", "calculate", "work out"]):
        return "PROBLEM"
    if any(x in q for x in ["example", "show"]):
        return "EXAMPLE"
    if any(x in q for x in ["define", "what is", "meaning of"]):
        return "DEFINITION"
    
    return "EXPLAIN"


def allowed_block_types_math(intent: str) -> set:
    """Allowed block types per intent (CELL 28)"""
    if intent == "PROBLEM":
        return {"question", "practice", "explanation"}
    if intent == "DEFINITION":
        return {"glossary", "rule", "explanation"}
    return {"explanation", "rule", "practice"}


def dense_retrieve_math(query: str, doc_id: str = "MATH4", k: int = 40) -> List[Dict]:
    """Dense retrieval for Math (CELL 29)"""
    embedder = get_embedder()
    collection = get_collection()
    
    if not embedder or not collection:
        return []
    
    try:
        qv = embedder.encode(
            [query],
            convert_to_numpy=True,
            normalize_embeddings=True
        )[0].tolist()
        
        out = collection.query(
            query_embeddings=[qv],
            n_results=k,
            where={"doc_id": doc_id},
            include=["documents", "metadatas", "distances"]
        )
        
        res = []
        for i in range(len(out["documents"][0])):
            sim = 1.0 - float(out["distances"][0][i])
            res.append({
                "id": out["ids"][0][i],
                "text": out["documents"][0][i],
                "meta": out["metadatas"][0][i],
                "dense_sim": sim
            })
        
        return res
        
    except Exception as e:
        print(f"Dense retrieval error: {e}")
        return []


def bm25_retrieve_math(query: str, doc_id: str = "MATH4", k: int = 40) -> List[Dict]:
    """BM25 retrieval for Math (CELL 30)"""
    if doc_id not in _bm25_indices:
        build_bm25_index(doc_id)
    
    if doc_id not in _bm25_indices:
        return []
    
    bm25 = _bm25_indices[doc_id]
    docs = _bm25_docs[doc_id]
    ids = _bm25_ids[doc_id]
    metas = _bm25_metas[doc_id]
    
    try:
        toks = tokenize(query)
        scores = bm25.get_scores(toks)
        
        top_idx = np.argsort(scores)[::-1][:k]
        
        res = []
        for i in top_idx:
            res.append({
                "id": ids[i],
                "text": docs[i],
                "meta": metas[i],
                "bm25": float(scores[i])
            })
        
        return res
        
    except Exception as e:
        print(f"BM25 retrieval error: {e}")
        return []


def hybrid_candidates_math(query: str, doc_id: str = "MATH4") -> List[Dict]:
    """Hybrid merge: 65% Dense + 35% BM25 (CELL 31)"""
    dense = dense_retrieve_math(query, doc_id)
    sparse = bm25_retrieve_math(query, doc_id)
    
    merged = {}
    
    for r in dense:
        merged[r["id"]] = {**r, "bm25": 0.0}
    
    for r in sparse:
        if r["id"] not in merged:
            merged[r["id"]] = {**r, "dense_sim": 0.0}
        else:
            merged[r["id"]]["bm25"] = r["bm25"]
    
    items = list(merged.values())
    
    if not items:
        return []
    
    # Normalize BM25 scores (CELL 31)
    bm = np.array([x.get("bm25", 0) for x in items])
    bm_min, bm_max = bm.min(), bm.max()
    bm_norm = (bm - bm_min) / (bm_max - bm_min + 1e-9)
    
    for i, it in enumerate(items):
        it["bm25_norm"] = float(bm_norm[i])
        it["hybrid_score"] = 0.65 * it.get("dense_sim", 0) + 0.35 * it["bm25_norm"]
    
    items.sort(key=lambda x: x["hybrid_score"], reverse=True)
    
    return items


def pick_chapter_hint(cands: List[Dict]) -> Tuple[Optional[str], float]:
    """Chapter voting (CELL 32)"""
    chapters = [c["meta"].get("chapter", "") for c in cands]
    chapters = [c for c in chapters if c]
    
    if not chapters:
        return None, 0.0
    
    cnt = Counter(chapters)
    top_ch, top_n = cnt.most_common(1)[0]
    conf = top_n / len(chapters)
    
    return top_ch, conf


def rerank_math(query: str, candidates: List[Dict], intent: str, top_k: int = 6) -> List[Dict]:
    """Neural rerank + Intent filtering (CELL 34)"""
    if len(candidates) == 0:
        return []
    
    # 1) Intent filtering
    allow = allowed_block_types_math(intent)
    
    filt = []
    for c in candidates:
        bt = c["meta"].get("block_type", "")
        if bt in allow:
            filt.append(c)
    
    if len(filt) == 0:
        return candidates[:top_k]  # Fallback
    
    # 2) Pure neural reranking
    reranker = get_reranker()
    if not reranker:
        return filt[:top_k]
    
    try:
        TOPN = min(30, len(filt))
        subset = filt[:TOPN]
        
        pairs = [(query, c["text"]) for c in subset]
        scores = reranker.predict(pairs)
        
        for c, s in zip(subset, scores):
            c["rerank_score"] = float(s)
        
        for c in filt[TOPN:]:
            c["rerank_score"] = 0.0
        
        filt.sort(key=lambda x: x["rerank_score"], reverse=True)
        
        return filt[:top_k]
        
    except Exception as e:
        print(f"Reranking error: {e}")
        return filt[:top_k]


def retrieve_math(query: str, k: int = 6, doc_id: str = "MATH4") -> Dict:
    """Final retrieve for Math (CELL 35)"""
    original_query = query
    rewritten_query = rewrite_query(query)
    
    intent = detect_intent_math(rewritten_query)
    
    cands = hybrid_candidates_math(rewritten_query, doc_id=doc_id)
    
    ch_hint, ch_conf = pick_chapter_hint(cands[:10])
    
    final = rerank_math(rewritten_query, cands, intent, top_k=k)
    
    return {
        "original_query": original_query,
        "rewritten_query": rewritten_query,
        "intent": intent,
        "chapter_hint": ch_hint,
        "chapter_conf": round(ch_conf, 3),
        "hits": final
    }


# ============================================================
# RAT (Retrieval-Augmented Thought) for Mathematics
# From Final_math_grade4.ipynb CELLS 41-46
# ============================================================

def _get_openai_client_for_rat():
    """Return the shared, pre-warmed OpenAI client from utils.llm.

    Previously this created a fresh, uncached client on every RAT call, which
    paid the Windows SSL trust-store initialisation cost (~60 s) on each math
    question. Now we delegate to the module-level cached client in utils.llm,
    which is pre-warmed at API startup.
    """
    try:
        from utils.llm import get_openai_client
        return get_openai_client()
    except Exception:
        return None


def _llm_chat(system: str, user: str, max_tokens: int = 200) -> str:
    """Simple LLM call for RAT"""
    client = _get_openai_client_for_rat()
    
    if not client:
        return ""
    
    try:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": user})
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.3
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        print(f"RAT LLM call error: {e}")
        return ""


def rat_generate_initial_cot(question: str) -> str:
    """RAT Module 1: Initial Chain-of-Thought Generator (CELL 41)"""
    prompt = f"""
You are a grade 4-7 math tutor.

Solve step-by-step.
Do NOT give final answer.
Only show reasoning steps.

Question:
{question}

Steps:
"""
    return _llm_chat("", prompt, 200)


def rat_retrieve_with_thoughts(
    question: str, cot_text: str, doc_id: str = "MATH4"
) -> List[Dict]:
    """RAT Module 2: Use Thoughts as Retrieval Queries (CELL 42).

    Retrieval is limited to the original question plus at most 2 CoT lines
    (3 queries total). Each `retrieve_math` call runs a CrossEncoder reranking
    step that takes ~3-5 s on CPU; running 17 queries (one per CoT line) was
    adding 50-85 s to every Maths chat reply in the React API.
    """
    queries = [question]
    for line in cot_text.split("\n"):
        if len(line.strip()) > 5:
            queries.append(line.strip())
        if len(queries) >= 3:
            break

    all_hits = []
    for q in queries:
        r = retrieve_math(q, doc_id=doc_id)
        all_hits.extend(r["hits"])

    return all_hits


def rat_verify_step(question: str, step: str, hits: List[Dict]) -> str:
    """RAT Module 3: Verify One Step (CELL 43)"""
    context = "\n".join(h["text"] for h in hits[:5])
    
    prompt = f"""
You are a strict math teacher.

Question: {question}
Reasoning Step: {step}

Textbook Context:
{context}

If step is correct, return same step.
If wrong, return corrected step only.
"""
    return _llm_chat("", prompt, 150)


def rat_reasoning_pipeline(question: str) -> Tuple[List[str], List[Dict]]:
    """RAT Module 4: Verify All Steps (CELL 44)"""
    cot = rat_generate_initial_cot(question)
    
    hits = rat_retrieve_with_thoughts(question, cot)
    
    steps = [s for s in cot.split("\n") if s.strip()]
    
    verified_steps = []
    for s in steps:
        fixed = rat_verify_step(question, s, hits)
        verified_steps.append(fixed)
    
    return verified_steps, hits


def retrieve_math_rat(query: str, k: int = 6, doc_id: str = "MATH4") -> Dict:
    """RAT-Based Retrieval Wrapper (CELL 46)"""
    # 1) Generate reasoning (RAT thoughts)
    cot = rat_generate_initial_cot(query)
    
    # 2) Retrieve using thoughts
    rat_hits = rat_retrieve_with_thoughts(query, cot, doc_id=doc_id)
    
    # Safety fallback
    if not rat_hits:
        return retrieve_math(query, k, doc_id=doc_id)
    
    # 3) Deduplicate by chunk id
    seen = {}
    for h in rat_hits:
        seen[h["id"]] = h
    
    merged = list(seen.values())
    
    # 4) Rerank
    intent = detect_intent_math(query)
    final_hits = rerank_math(query, merged, intent, top_k=k)
    
    return {
        "original_query": query,
        "rewritten_query": query,
        "intent": intent,
        "chapter_hint": None,
        "chapter_conf": 0.0,
        "hits": final_hits
    }


# ============================================================
# COMPUTER RETRIEVAL (from merged_comp_6_imp_last.ipynb)
# Hybrid + RRF Fusion + Keyword Gate + Type Filtering
# ============================================================

def detect_intent_computer(q: str) -> str:
    """Intent detection for Computer (CELL 16)"""
    q = q.lower()
    
    if any(x in q for x in ["define", "what is", "meaning"]):
        return "DEFINE"
    if any(x in q for x in ["how to", "steps", "create", "open", "procedure"]):
        return "PROCEDURE"
    if any(x in q for x in ["code", "program", "write a"]):
        return "CODE"
    
    return "GENERAL"


def allowed_block_types_computer(intent: str) -> set:
    """Allowed block types per intent for Computer (CELL 16)"""
    base = {"BODY", "EXPLANATION", "DEFINITION", "PROCEDURE", "EXAMPLE", "SLO", "KEY_POINTS"}
    if intent == "DEFINE":
        return {"DEFINITION", "BODY", "EXPLANATION", "GLOSSARY", "SLO", "KEY_POINTS"}
    if intent == "PROCEDURE":
        return {"PROCEDURE", "BODY", "EXPLANATION", "SLO"}
    if intent == "CODE":
        return {"CODE", "EXAMPLE", "BODY"}
    return base


def chroma_dense_computer(query: str, doc_id: str = "CS6", top_k: int = 25) -> List[Dict]:
    """Dense retrieve from Chroma (CELL 17)"""
    embedder = get_embedder()
    collection = get_collection()
    
    if not embedder or not collection:
        return []
    
    try:
        q_emb = embedder.encode([query], normalize_embeddings=True)[0].astype("float32").tolist()
        
        res = collection.query(
            query_embeddings=[q_emb],
            n_results=top_k,
            where={"doc_id": doc_id},
            include=["documents", "metadatas", "distances"]
        )
        
        out = []
        docs_ = res["documents"][0]
        metas_ = res["metadatas"][0]
        dists_ = res["distances"][0]
        
        for doc, meta, dist in zip(docs_, metas_, dists_):
            out.append({
                "text": doc,
                "meta": meta,
                "score": float(1.0 / (1.0 + dist)),
                "src": "dense"
            })
        
        return out
        
    except Exception as e:
        print(f"Dense retrieval error (Computer): {e}")
        return []


def bm25_lexical_computer(query: str, doc_id: str = "CS6", top_k: int = 25) -> List[Dict]:
    """BM25 retrieve (CELL 18)"""
    if doc_id not in _bm25_indices:
        build_bm25_index(doc_id)
    
    if doc_id not in _bm25_indices:
        return []
    
    bm25 = _bm25_indices[doc_id]
    docs = _bm25_docs[doc_id]
    metas = _bm25_metas[doc_id]
    
    try:
        q_toks = tokenize(query)
        scores = bm25.get_scores(q_toks)
        idxs = np.argsort(scores)[::-1][:top_k]
        
        out = []
        for idx in idxs:
            out.append({
                "text": docs[idx],
                "meta": metas[idx],
                "score": float(scores[idx]),
                "src": "bm25"
            })
        
        return out
        
    except Exception as e:
        print(f"BM25 retrieval error (Computer): {e}")
        return []


def keyword_gate(query: str, passage: str, intent: str = "GENERAL") -> bool:
    """Stricter keyword gate (CELL 19)"""
    q_toks = tokenize(query)
    if not q_toks:
        return True
    
    p_toks = set(tokenize((passage or "")[:1400]))
    overlap = len(set(q_toks) & p_toks)
    
    # Short queries like "Define ICT" should pass with 1 overlap
    if len(q_toks) <= 2:
        return overlap >= 1
    
    if intent in ["PROCEDURE"]:
        return overlap >= 1
    else:
        # DEFINE / GENERAL / CODE: be stricter
        return overlap >= 2


def rrf_fuse(list_a: List[Dict], list_b: List[Dict], k: int = 60) -> List[Dict]:
    """Reciprocal Rank Fusion (CELL 19)"""
    pool = {}
    
    def add(lst):
        for r, item in enumerate(lst, start=1):
            cid = (item.get("meta") or {}).get("chunk_id") or (item.get("meta") or {}).get("text_hash") or f"rank_{r}"
            if cid not in pool:
                pool[cid] = {**item, "rrf": 0.0}
            pool[cid]["rrf"] += 1.0 / (k + r)
    
    add(list_a)
    add(list_b)
    
    # Block-type weighting
    for cid, it in pool.items():
        bt = ((it.get("meta") or {}).get("block_type") or "BODY").strip().upper()
        it["rrf"] *= BLOCK_WEIGHT.get(bt, 0.8)
    
    return sorted(pool.values(), key=lambda x: x["rrf"], reverse=True)


def retrieve_hybrid_computer(
    query: str,
    top_k: int = 8,
    dense_k: int = 40,
    bm25_k: int = 40,
    doc_id: str = "CS6",
) -> Dict:
    """Hybrid retrieval for Computer (CELL 19)"""
    intent = detect_intent_computer(query)
    allowed = allowed_block_types_computer(intent)
    
    dense = chroma_dense_computer(query, doc_id=doc_id, top_k=dense_k)
    lex = bm25_lexical_computer(query, doc_id=doc_id, top_k=bm25_k)
    
    fused = rrf_fuse(dense, lex, k=60)
    
    final = []
    seen = set()
    
    for it in fused:
        meta = it.get("meta") or {}
        cid = meta.get("chunk_id") or meta.get("text_hash")
        
        if cid in seen:
            continue
        seen.add(cid)
        
        bt = (meta.get("block_type") or "BODY").strip().upper()
        if bt not in allowed:
            continue
        if bt == "WEBLINKS":
            continue
        if not keyword_gate(query, it.get("text", ""), intent=intent):
            continue
        
        final.append(it)
        if len(final) >= top_k:
            break
    
    return {"intent": intent, "hits": final}


# ============================================================
# SCIENCE RETRIEVAL (similar to Computer - Hybrid + RRF)
# ============================================================

def detect_intent_science(q: str) -> str:
    """Intent detection for Science"""
    q = q.lower()
    
    if any(x in q for x in ["define", "what is", "meaning"]):
        return "DEFINE"
    if any(x in q for x in ["how", "process", "steps", "works"]):
        return "PROCESS"
    if any(x in q for x in ["why", "reason", "cause"]):
        return "EXPLANATION"
    if any(x in q for x in ["list", "types", "examples"]):
        return "LIST"
    
    return "GENERAL"


def allowed_block_types_science(intent: str) -> set:
    """Allowed block types per intent for Science"""
    if intent == "DEFINE":
        return {"DEFINITION", "BODY", "EXPLANATION", "GLOSSARY"}
    if intent == "PROCESS":
        return {"PROCEDURE", "BODY", "EXPLANATION"}
    if intent == "LIST":
        return {"BODY", "EXPLANATION", "EXAMPLE"}
    return {"BODY", "EXPLANATION", "DEFINITION", "EXAMPLE"}


def chroma_dense_science(query: str, doc_id: str = "GS4", top_k: int = 25) -> List[Dict]:
    """Dense retrieve for Science"""
    embedder = get_embedder()
    collection = get_collection()
    
    if not embedder or not collection:
        return []
    
    try:
        q_emb = embedder.encode([query], normalize_embeddings=True)[0].astype("float32").tolist()
        
        res = collection.query(
            query_embeddings=[q_emb],
            n_results=top_k,
            where={"doc_id": doc_id},
            include=["documents", "metadatas", "distances"]
        )
        
        out = []
        docs_ = res["documents"][0]
        metas_ = res["metadatas"][0]
        dists_ = res["distances"][0]
        
        for doc, meta, dist in zip(docs_, metas_, dists_):
            out.append({
                "text": doc,
                "meta": meta,
                "score": float(1.0 / (1.0 + dist)),
                "src": "dense"
            })
        
        return out
        
    except Exception as e:
        print(f"Dense retrieval error (Science): {e}")
        return []


def bm25_lexical_science(query: str, doc_id: str = "GS4", top_k: int = 25) -> List[Dict]:
    """BM25 retrieve for Science"""
    if doc_id not in _bm25_indices:
        build_bm25_index(doc_id)
    
    if doc_id not in _bm25_indices:
        return []
    
    bm25 = _bm25_indices[doc_id]
    docs = _bm25_docs[doc_id]
    metas = _bm25_metas[doc_id]
    
    try:
        q_toks = tokenize(query)
        scores = bm25.get_scores(q_toks)
        idxs = np.argsort(scores)[::-1][:top_k]
        
        out = []
        for idx in idxs:
            out.append({
                "text": docs[idx],
                "meta": metas[idx],
                "score": float(scores[idx]),
                "src": "bm25"
            })
        
        return out
        
    except Exception as e:
        print(f"BM25 retrieval error (Science): {e}")
        return []


def retrieve_hybrid_science(
    query: str,
    top_k: int = 8,
    dense_k: int = 40,
    bm25_k: int = 40,
    doc_id: str = "GS4",
) -> Dict:
    """Hybrid retrieval for Science"""
    intent = detect_intent_science(query)
    allowed = allowed_block_types_science(intent)
    
    dense = chroma_dense_science(query, doc_id=doc_id, top_k=dense_k)
    lex = bm25_lexical_science(query, doc_id=doc_id, top_k=bm25_k)
    
    fused = rrf_fuse(dense, lex, k=60)
    
    final = []
    seen = set()
    
    for it in fused:
        meta = it.get("meta") or {}
        cid = meta.get("chunk_id") or meta.get("text_hash")
        
        if cid in seen:
            continue
        seen.add(cid)
        
        bt = (meta.get("block_type") or "BODY").strip().upper()
        if bt not in allowed:
            continue
        if bt == "WEBLINKS":
            continue
        if not keyword_gate(query, it.get("text", ""), intent=intent):
            continue
        
        final.append(it)
        if len(final) >= top_k:
            break
    
    return {"intent": intent, "hits": final}


# ============================================================
# MAIN QUERY FUNCTION (Routes to subject-specific pipeline)
# ============================================================

def _hit_primary_score(h: Dict) -> Optional[float]:
    """Pick the best score field for one hit (pipelines use different fields)."""
    if h.get("rerank_score") is not None:
        return float(h["rerank_score"])
    if h.get("score") is not None:
        return float(h["score"])
    if h.get("dense_sim") is not None:
        return float(h["dense_sim"])
    if h.get("hybrid_score") is not None:
        return float(h["hybrid_score"])
    if h.get("rrf") is not None:
        return float(h["rrf"])
    return None


def compute_relevance_score(hits: List[Dict]) -> float:
    """
    Compute overall relevance from the top-ranked hit.

    Pipelines store scores differently:
    - Maths: cross-encoder rerank_score (good > ~0, bad is negative)
    - Science/Computer: Chroma dense similarity in ``score`` (~0.3–0.9)
    - RRF fusion scores are tiny (~0.03) and must NOT be preferred over dense sim
    """
    if not hits:
        return 0.0

    top = hits[0]
    score = _hit_primary_score(top)
    if score is None:
        return 0.0

    if top.get("rerank_score") is not None:
        # ms-marco cross-encoder: modest positives (~0–3) are still good matches
        if score >= 2.0:
            return min(1.0, 0.85 + score * 0.02)
        if score >= 0:
            return min(1.0, 0.45 + score * 0.15)
        return max(0.0, 0.35 + score * 0.1)

    if top.get("score") is not None or top.get("dense_sim") is not None:
        return min(1.0, max(0.0, score))

    # RRF-only (no dense sim on fused hit): small rank scores; any gated hit counts
    if top.get("rrf") is not None:
        return 0.5

    return min(1.0, max(0.0, score))


# Subject-specific keywords to help detect off-topic questions
SUBJECT_KEYWORDS = {
    "Maths": [
        "add", "subtract", "multiply", "divide", "number", "count", "sum", "total",
        "fraction", "decimal", "percent", "equation", "solve", "calculate", "math",
        "plus", "minus", "times", "equal", "greater", "less", "angle", "shape",
        "triangle", "square", "circle", "rectangle", "area", "perimeter", "volume",
        "geometry", "algebra", "arithmetic", "digit", "place value", "even", "odd",
        "prime", "factor", "multiple", "ratio", "proportion", "average", "mean",
        "graph", "chart", "table", "pattern", "sequence", "formula", "measurement",
        "meter", "kilometer", "gram", "kilogram", "liter", "time", "clock", "money",
        # Common question phrasing (textbook-style)
        "what", "how", "find", "simplify", "convert", "lcm", "hcf", "unit",
    ],
    "General Science": [
        "animal", "plant", "cell", "body", "organ", "blood", "heart", "brain",
        "water", "air", "earth", "sun", "moon", "star", "planet", "weather",
        "energy", "force", "gravity", "magnet", "electric", "light", "sound",
        "heat", "temperature", "solid", "liquid", "gas", "matter", "atom",
        "molecule", "chemical", "reaction", "food", "nutrition", "health",
        "disease", "medicine", "environment", "pollution", "ecosystem", "habitat",
        "photosynthesis", "respiration", "digestion", "skeleton", "muscle", "nerve",
        "metal", "brass", "iron", "copper", "zinc", "rock", "mineral", "soil",
        "what", "how", "why", "define", "explain", "types", "name", "describe",
    ],
    "Computer": [
        "computer", "keyboard", "mouse", "monitor", "screen", "cpu", "ram",
        "memory", "storage", "hard drive", "software", "hardware", "program",
        "code", "coding", "internet", "website", "browser", "email", "file",
        "folder", "save", "delete", "copy", "paste", "print", "scan", "input",
        "output", "process", "data", "information", "digital", "technology",
        "network", "wifi", "bluetooth", "usb", "application", "app", "operating",
        "windows", "icon", "desktop", "laptop", "tablet", "smartphone",
        "what", "how", "define", "explain", "ict", "word", "excel", "powerpoint",
    ]
}


def _decide_is_relevant(
    hits: List[Dict],
    relevance_score: float,
    query_seems_related: bool,
) -> bool:
    """
    Decide if retrieved chunks are textbook-grounded enough to tutor.

    Pipelines already filter candidates (BM25 + keyword gate + rerank).
    Default: trust retrieval unless scores are clearly bad — reduces false
    "not in textbook" replies when wording differs from the book.
    """
    if not hits:
        return False

    top = hits[0]
    rerank = top.get("rerank_score")
    if rerank is not None:
        if float(rerank) >= -2.5:
            return True
        if float(rerank) < -5.0:
            return False

    dense = top.get("dense_sim")
    if dense is None:
        dense = top.get("score")
    if dense is not None and float(dense) >= 0.12:
        return True

    # RRF / hybrid: multiple hits means retrieval found something on-topic
    if len(hits) >= 2 and relevance_score >= 0.12:
        return True

    lo = float(os.getenv("RAG_RELEVANCE_THRESHOLD", "0.18"))
    hi = float(os.getenv("RAG_STRICT_THRESHOLD", "0.25"))
    threshold = lo if query_seems_related else hi
    return relevance_score >= threshold


def is_query_related_to_subject(query: str, subject: str) -> bool:
    """
    Check if the query contains keywords related to the subject.
    Returns True if query seems related, False if it seems off-topic.
    """
    query_lower = query.lower()
    keywords = SUBJECT_KEYWORDS.get(normalize_subject(subject), [])
    
    # Check if any subject keyword appears in the query
    for keyword in keywords:
        if keyword in query_lower:
            return True
    
    # If query doesn't contain any subject keywords, it might be off-topic
    # But we'll still let RAG decide with stricter threshold
    return False


def query_knowledge_base(
    query: str,
    grade: int,
    subject: str,
    n_results: int = 6,
    use_rat: bool = True
) -> Dict:
    """
    Main query function that routes to subject-specific retrieval pipeline.
    
    Returns:
        Dict with keys:
        - documents: List of retrieved documents
        - relevance_score: Float 0-1 indicating how relevant the results are
        - is_relevant: Boolean indicating if content is from the textbook
    
    Pipelines:
    - Maths: RAT + Hybrid (65% Dense + 35% BM25) + CrossEncoder Reranking
    - Computer: Hybrid + RRF + Keyword Gate + Type Filtering
    - Science: Hybrid + RRF + Keyword Gate + Type Filtering
    """
    subject_key = normalize_subject(subject)
    doc_id = get_doc_id_for_grade(grade, subject)
    print(
        f"[RAG] Query: '{query[:50]}...' | Grade: {grade} | "
        f"Subject: {subject_key} | doc_id: {doc_id}"
    )

    # Quick topic-relatedness check used for relevance threshold selection below.
    quick_related = is_query_related_to_subject(query, subject_key)

    # Route to subject-specific pipeline (scoped to this grade's textbook)
    if subject_key == "Maths":
        # RAT (Retrieve-And-Think): CoT generation → multi-query retrieval → rerank.
        # Slower than single-pass hybrid (~15+ s on CPU) but improves procedural maths.
        if use_rat:
            try:
                result = retrieve_math_rat(query, k=n_results, doc_id=doc_id)
            except Exception as e:
                print(f"[RAG] RAT failed, falling back: {e}")
                result = retrieve_math(query, k=n_results, doc_id=doc_id)
        else:
            result = retrieve_math(query, k=n_results, doc_id=doc_id)
        hits = result.get("hits", [])
        
    elif subject_key == "Computer":
        result = retrieve_hybrid_computer(query, top_k=n_results, doc_id=doc_id)
        hits = result.get("hits", [])
        
    elif subject_key == "General Science":
        result = retrieve_hybrid_science(query, top_k=n_results, doc_id=doc_id)
        hits = result.get("hits", [])
        
    else:
        # Fallback
        result = retrieve_hybrid_science(query, top_k=n_results, doc_id=doc_id)
        hits = result.get("hits", [])
    
    # Re-use the quick_related result computed before the routing (avoids a
    # second identical call to is_query_related_to_subject).
    query_seems_related = quick_related
    
    # Compute relevance score from retrieved hits
    relevance_score = compute_relevance_score(hits)
    is_relevant = _decide_is_relevant(hits, relevance_score, quick_related)
    threshold_note = (
        float(os.getenv("RAG_RELEVANCE_THRESHOLD", "0.18"))
        if quick_related
        else float(os.getenv("RAG_STRICT_THRESHOLD", "0.25"))
    )
    
    # Format results
    documents = []
    for h in hits:
        documents.append({
            "content": h.get("text", ""),
            "metadata": h.get("meta", {}),
            "score": h.get("rerank_score") or h.get("dense_sim") or h.get("hybrid_score") or h.get("rrf") or h.get("score", 0)
        })
    
    print(
        f"[RAG] Query related to {subject}: {query_seems_related} | "
        f"Relevance: {relevance_score:.3f} | ref_threshold: {threshold_note:.2f} | "
        f"hits: {len(hits)} | Is relevant: {is_relevant}"
    )
    
    return {
        "documents": documents,
        "relevance_score": relevance_score,
        "is_relevant": is_relevant,
        "subject": subject_key,
        "doc_id": doc_id,
        "grade": grade,
        "query_related_to_subject": query_seems_related
    }


def format_context_for_prompt(documents: List[Dict]) -> str:
    """Format retrieved documents into context for the LLM"""
    if not documents:
        return ""
    
    context_parts = []
    for i, doc in enumerate(documents, 1):
        content = doc.get('content', '')
        metadata = doc.get('metadata', {})
        
        chapter = metadata.get('chapter', '')
        section = metadata.get('section', '')
        chunk_id = metadata.get('chunk_id', '')
        
        context_parts.append(
            f"[{i}] (chunk_id={chunk_id}) (chapter={chapter}) (section={section})\n{content.strip()}"
        )
    
    return "\n\n---\n\n".join(context_parts)


def check_db_status() -> Dict:
    """Check the status of the ChromaDB connection"""
    status = {
        "chroma_connected": False,
        "embedder_loaded": False,
        "reranker_loaded": False,
        "bm25_available": BM25_AVAILABLE,
        "total_vectors": 0,
        "chroma_path": CHROMA_PATH
    }
    
    client = get_chroma_client()
    if client:
        status["chroma_connected"] = True
        collection = get_collection()
        if collection:
            status["total_vectors"] = collection.count()
    
    if get_embedder():
        status["embedder_loaded"] = True
    
    if get_reranker():
        status["reranker_loaded"] = True
    
    return status


def preload_models():
    """Pre-warm all heavy resources so the first user request is fast.

    Safe to call from both Streamlit (app.py) and FastAPI (api_server startup
    event). Does NOT use st.session_state so it works outside Streamlit.
    """
    print("[RAG] Preloading models...")
    get_chroma_client()
    get_collection()
    get_embedder()
    get_reranker()
    print("[RAG] Models preloaded successfully!")

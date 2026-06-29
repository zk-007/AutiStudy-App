#!/usr/bin/env python3
"""
Re-index MATH7 in OneSharedChromaDB from math_parse_7.md.

Backs up DB, deletes old MATH7 vectors, upserts full 13-chapter index with unit metadata.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

import chromadb
import numpy as np
from sentence_transformers import SentenceTransformer

from utils.chroma_math_index import EMBED_MODEL_NAME, build_chunks_from_md, verify_unit_coverage

CHROMA_PATH = BACKEND / "OneSharedChromaDB"
COLLECTION = "ptb_textbooks"
MD_PATH = BACKEND.parent / "frontend" / "books_mds" / "Grade 7" / "math" / "math_parse_7.md"
DOC_ID = "MATH7"
EXPECTED_UNITS = list(range(1, 14))


def backup_chroma() -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = BACKEND / f"OneSharedChromaDB_backup_{ts}"
    print(f"Backing up -> {dest}")
    shutil.copytree(CHROMA_PATH, dest)
    return dest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-backup", action="store_true")
    args = parser.parse_args()

    if not MD_PATH.exists():
        raise FileNotFoundError(MD_PATH)

    chunks = build_chunks_from_md(MD_PATH, doc_id=DOC_ID, grade=7)
    report = verify_unit_coverage(chunks, EXPECTED_UNITS)
    print("=== MATH7 chunk build ===")
    print(f"  total: {report['total_chunks']}")
    print(f"  units present: {report['present']}")
    print(f"  per-unit counts: {report['counts']}")
    if report["missing"]:
        raise RuntimeError(f"Still missing units: {report['missing']}")

    if args.dry_run:
        print("Dry run OK.")
        return

    if not args.skip_backup:
        backup_chroma()

    embedder = SentenceTransformer(EMBED_MODEL_NAME)
    col = chromadb.PersistentClient(path=str(CHROMA_PATH)).get_or_create_collection(COLLECTION)

    col.delete(where={"doc_id": DOC_ID})
    print(f"Deleted old {DOC_ID} chunks")

    docs = [c["text"] for c in chunks]
    ids = [c["chunk_id"] for c in chunks]
    metas = []
    for c in chunks:
        m = {k: c[k] for k in [
            "chunk_id", "doc_id", "grade", "subject", "book", "unit", "chapter",
            "section", "block_type", "source_type", "source_pdf", "text_hash",
        ]}
        m["grade"] = int(c["grade"])
        m["embed_model"] = EMBED_MODEL_NAME
        metas.append(m)

    print(f"Embedding {len(docs)} chunks...")
    emb_parts = []
    for i in range(0, len(docs), 64):
        emb_parts.append(
            embedder.encode(docs[i:i + 64], normalize_embeddings=True, show_progress_bar=True)
        )
    embeddings = np.vstack(emb_parts).astype("float32")

    for i in range(0, len(ids), 500):
        j = i + 500
        col.upsert(
            ids=ids[i:j],
            documents=docs[i:j],
            metadatas=metas[i:j],
            embeddings=embeddings[i:j].tolist(),
        )
        print(f"  upserted {i}..{min(j, len(ids))}")

    r = col.get(where={"doc_id": DOC_ID}, include=["metadatas"])
    units = sorted({m.get("unit") for m in r["metadatas"] if m.get("unit")})
    print(f"Done. {DOC_ID}: {len(r['ids'])} chunks, units={units}, collection total={col.count()}")


if __name__ == "__main__":
    main()

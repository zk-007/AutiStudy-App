#!/usr/bin/env python3
"""
Re-index CS6 + CS7 in OneSharedChromaDB from updated MD files.

1. Backs up the current DB folder (copy, not move).
2. Deletes only doc_id CS6 / CS7 chunks.
3. Re-builds chunks using notebook-equivalent pipeline (with unit fixes).
4. Upserts new embeddings.

Usage (from backend/):
    python scripts/reindex_computer_chroma.py
    python scripts/reindex_computer_chroma.py --dry-run
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

from utils.chroma_computer_index import (
    EMBED_MODEL_NAME,
    build_chunks_from_md,
    verify_unit_coverage,
)

CHROMA_PATH = BACKEND / "OneSharedChromaDB"
COLLECTION = "ptb_textbooks"
BOOKS = BACKEND.parent / "frontend" / "books_mds"

BOOKS_TO_INDEX = [
    {
        "doc_id": "CS6",
        "grade": 6,
        "md": BOOKS / "Grade 6" / "comp" / "comp_6.md",
    },
    {
        "doc_id": "CS7",
        "grade": 7,
        "md": BOOKS / "Grade 7" / "comp" / "comp_7.md",
    },
]


def backup_chroma() -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = BACKEND / f"OneSharedChromaDB_backup_{ts}"
    if not CHROMA_PATH.exists():
        raise FileNotFoundError(f"ChromaDB not found: {CHROMA_PATH}")
    print(f"Backing up {CHROMA_PATH} -> {dest}")
    shutil.copytree(CHROMA_PATH, dest)
    print(f"Backup done ({sum(1 for _ in dest.rglob('*') if _.is_file())} files)")
    return dest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Build chunks only; no DB write")
    parser.add_argument("--skip-backup", action="store_true", help="Skip backup copy")
    args = parser.parse_args()

    all_chunks: list = []
    for spec in BOOKS_TO_INDEX:
        md = spec["md"]
        if not md.exists():
            raise FileNotFoundError(f"Missing MD: {md}")
        chunks = build_chunks_from_md(
            md,
            doc_id=spec["doc_id"],
            grade=spec["grade"],
        )
        report = verify_unit_coverage(chunks, spec["grade"])
        print(f"\n=== {spec['doc_id']} from {md.name} ===")
        print(f"  chunks: {report['total_chunks']}")
        print(f"  units present: {report['present']}")
        print(f"  per-unit counts: {report['counts']}")
        if report["missing"]:
            raise RuntimeError(
                f"{spec['doc_id']} still missing units {report['missing']} — fix MD/parse before upsert"
            )
        all_chunks.extend(chunks)

    if args.dry_run:
        print(f"\nDry run OK — {len(all_chunks)} chunks ready, no DB changes.")
        return

    if not args.skip_backup:
        backup_chroma()

    print(f"\nLoading embedder: {EMBED_MODEL_NAME}")
    embedder = SentenceTransformer(EMBED_MODEL_NAME)

    client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    col = client.get_or_create_collection(name=COLLECTION)

    for doc_id in ("CS6", "CS7"):
        try:
            col.delete(where={"doc_id": doc_id})
            print(f"Deleted old chunks where doc_id={doc_id}")
        except Exception as err:
            print(f"Delete {doc_id}: {err}")

    docs = [c["text"] for c in all_chunks]
    ids = [c["chunk_id"] for c in all_chunks]
    metas = []
    for c in all_chunks:
        m = {k: c[k] for k in [
            "chunk_id", "doc_id", "grade", "subject", "book", "unit", "chapter",
            "section", "block_type", "source_type", "source_pdf", "text_hash",
        ]}
        m["embed_model"] = EMBED_MODEL_NAME
        # Chroma metadata values must be str/int/float/bool
        m["grade"] = int(c["grade"])
        metas.append(m)

    print(f"Embedding {len(docs)} chunks...")
    batch = 64
    emb_parts = []
    for i in range(0, len(docs), batch):
        emb = embedder.encode(
            docs[i:i + batch],
            normalize_embeddings=True,
            show_progress_bar=True,
        )
        emb_parts.append(emb)
    embeddings = np.vstack(emb_parts).astype("float32")

    print("Upserting to Chroma...")
    upsert_batch = 500
    for i in range(0, len(ids), upsert_batch):
        j = i + upsert_batch
        col.upsert(
            ids=ids[i:j],
            documents=docs[i:j],
            metadatas=metas[i:j],
            embeddings=embeddings[i:j].tolist(),
        )
        print(f"  upserted {i}..{min(j, len(ids))}")

    total = col.count()
    print(f"\nDone. Collection total: {total} chunks")
    for doc_id in ("CS6", "CS7"):
        r = col.get(where={"doc_id": doc_id}, include=["metadatas"])
        units = sorted({m.get("unit", "") for m in r["metadatas"] if m.get("unit")})
        print(f"  {doc_id}: {len(r['ids'])} chunks, units in metadata: {units}")


if __name__ == "__main__":
    main()

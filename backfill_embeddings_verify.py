"""
backfill_embeddings_verify.py
Quick inspection of Chroma embedding collection(s).
"""

import os
import chromadb
from textwrap import shorten

# --- Config ---
PERSIST_DIR = os.path.abspath("./chroma")
PRIMARY_COLLECTION = os.getenv("VERIFY_COLLECTION", "reddit_posts")  # override via env
SHOW_LIMIT = int(os.getenv("VERIFY_SHOW_LIMIT", "5"))
INCLUDE_DOC_SNIPPET = True  # set False if you only want metadata
SNIPPET_CHARS = 160

print(f"🔍 Using Chroma dir: {PERSIST_DIR}")
client = chromadb.PersistentClient(path=PERSIST_DIR)

# List collections
cols = client.list_collections()
if not cols:
    print("❌ No collections found.")
    exit()

print("\n📦 Collections:")
for c in cols:
    try:
        print(f"  - {c.name} (count={c.count()})")
    except Exception as e:
        print(f"  - {c.name} (error getting count: {e})")

# Get primary collection
try:
    col = client.get_collection(PRIMARY_COLLECTION)
except Exception as e:
    print(f"\n❌ Could not open collection '{PRIMARY_COLLECTION}': {e}")
    exit()

print(f"\n✅ Opened collection: {PRIMARY_COLLECTION}")
print(f"Total vectors: {col.count()}")

# Fetch sample records
sample = col.get(limit=SHOW_LIMIT, include=["metadatas", "documents"])
ids = sample.get("ids", [])
if not ids:
    print("\n(No items returned for sample; collection may be empty.)")
    exit()

print(f"\n📝 Showing first {len(ids)} item(s):\n")
for i, _id in enumerate(ids, start=1):
    md = sample["metadatas"][i-1]
    title = md.get("title", "")
    subreddit = md.get("subreddit", "")
    summary = md.get("summary", "")
    print(f"{i}. ID: {_id}")
    print(f"   Subreddit: {subreddit}")
    print(f"   Title    : {shorten(title, width=100, placeholder='…')}")
    print(f"   Summary  : {shorten(summary, width=100, placeholder='…')}")
    if INCLUDE_DOC_SNIPPET:
        doc_snip = shorten(sample["documents"][i-1].replace("\n", " "), width=SNIPPET_CHARS, placeholder="…")
        print(f"   Doc Snip : {doc_snip}")
    print()

# Simple query test (optional)
TEST_QUERY = os.getenv("VERIFY_TEST_QUERY")
if TEST_QUERY:
    print(f"\n🔎 Query test: {TEST_QUERY}")
    # Lightweight embedding using legacy path (assumes same dim=256)
    try:
        from vertexai.language_models import TextEmbeddingModel, TextEmbeddingInput
        import vertexai
        project = os.getenv("GOOGLE_CLOUD_PROJECT")
        region = os.getenv("GOOGLE_CLOUD_REGION", "us-central1")
        if project:
            vertexai.init(project=project, location=region)
            q_model = TextEmbeddingModel.from_pretrained("text-embedding-004")
            q_input = TextEmbeddingInput(text=TEST_QUERY, task_type="RETRIEVAL_QUERY")
            q_vec = q_model.get_embeddings([q_input], output_dimensionality=256)[0].values
            res = col.query(query_embeddings=[q_vec], n_results=5, include=["metadatas"])
            print("\nTop matches:")
            for rank, pid in enumerate(res["ids"][0], start=1):
                md = res["metadatas"][0][rank-1]
                print(f" {rank}. {pid} | {md.get('title','')[:80]}")
        else:
            print("   (Skipping query test: GOOGLE_CLOUD_PROJECT not set)")
    except Exception as e:
        print(f"   Query test failed: {e}")

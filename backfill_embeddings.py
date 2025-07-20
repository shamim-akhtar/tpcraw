import os
import sys
import firebase_admin
from firebase_admin import credentials, firestore
import vertexai
import chromadb
from tqdm import tqdm
import logging
from typing import Optional, Tuple

# ===== Config =====
PERSIST_DIR = "./chroma"
COLLECTION_NAME = "reddit_posts"
MAX_CHARS = 20000
TRUNCATE_SUFFIX = "\n...[TRUNCATED FOR EMBEDDING]"
SKIP_IF_EXISTS = True
ADD_FIRESTORE_FLAG = False
LOG_FILE = "backfill_embeddings.log"
EMBED_DIM = 256

# Test controls (set via env; leave unset for full run)
TEST_LIMIT = int(os.getenv("BACKFILL_LIMIT", "0"))            # e.g. 5
TEST_COLLECTION = os.getenv("BACKFILL_TEST_COLLECTION", "")   # e.g. "reddit_posts_test"
DRY_RUN = os.getenv("BACKFILL_DRY_RUN", "0") == "1"

logging.basicConfig(filename=LOG_FILE, level=logging.INFO,
                    format="%(asctime)s %(levelname)s: %(message)s")

# ===== Firebase =====
try:
    cred = credentials.Certificate("firebase-credentials.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Firebase initialized.")
except Exception as e:
    print(f"CRITICAL: Firebase init failed: {e}")
    sys.exit(1)

# ===== Vertex + Embedding Model (preview → legacy fallback) =====
GCP_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT")
GCP_LOCATION = os.getenv("GOOGLE_CLOUD_REGION", "us-central1")
if not GCP_PROJECT:
    print("CRITICAL: GOOGLE_CLOUD_PROJECT not set.")
    sys.exit(1)

vertexai.init(project=GCP_PROJECT, location=GCP_LOCATION)
try:
    from vertexai.preview import text_embedding
    API_MODE = "preview"
    _model = text_embedding.TextEmbeddingModel.from_pretrained("text-embedding-004")
except ImportError:
    from vertexai.language_models import TextEmbeddingModel, TextEmbeddingInput
    API_MODE = "legacy"
    _model = TextEmbeddingModel.from_pretrained("text-embedding-004")
print(f"✅ Embedding model loaded (mode={API_MODE}).")

def get_embedding(text: str):
    try:
        if API_MODE == "preview":
            inp = text_embedding.TextEmbeddingInput(text=text, task_type="RETRIEVAL_DOCUMENT")
        else:
            inp = TextEmbeddingInput(text=text, task_type="RETRIEVAL_DOCUMENT")
        return _model.get_embeddings([inp], output_dimensionality=EMBED_DIM)[0].values
    except Exception as e:
        logging.error(f"Embedding error: {e}")
        return None

# ===== Chroma =====
try:
    chroma_client = chromadb.PersistentClient(path=PERSIST_DIR)
    effective_collection = TEST_COLLECTION or COLLECTION_NAME
    embedding_collection = chroma_client.get_or_create_collection(effective_collection)
    print(f"✅ Chroma collection: {effective_collection}")
    if DRY_RUN:
        print("🟡 DRY RUN: No writes will be performed.")
except Exception as e:
    print(f"CRITICAL: Chroma init failed: {e}")
    sys.exit(1)

# ===== Helpers =====
def normalize_subreddit(name: str) -> Tuple[str, str]:
    sub = name.lower()
    coll = "posts" if sub == "temasekpoly" else f"{sub}_posts"
    return sub, coll

def safe_combine(title: str, body: str, comments: str, summary: str) -> str:
    combined = f"{title}\n\n{body}\n\n{comments}\n\n{summary}"
    return combined[:MAX_CHARS] + TRUNCATE_SUFFIX if MAX_CHARS and len(combined) > MAX_CHARS else combined

def fetch_post_data(coll: str, post_id: str) -> Optional[Tuple[str,str,str]]:
    snap = db.collection(coll).document(post_id).get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    title = data.get("title",""); body = data.get("body",""); summary = data.get("summary","")
    comments_ref = db.collection(coll).document(post_id).collection("comments")
    comments = "\n".join([c.to_dict().get("body","") for c in comments_ref.stream()])
    return safe_combine(title, body, comments, summary), title, summary

def list_post_ids(coll: str):
    return [d.id for d in db.collection(coll).stream()]

def already_embedded(post_id: str) -> bool:
    try:
        res = embedding_collection.get(ids=[post_id])
        return len(res.get("ids", [])) > 0
    except Exception:
        return False

def backfill(subreddit: str):
    sub_lower, coll = normalize_subreddit(subreddit)
    print(f"\n=== {subreddit} ({coll}) ===")
    # Limit newest N if TEST_LIMIT set
    if TEST_LIMIT > 0:
        try:
            q = db.collection(coll).order_by("created", direction=firestore.Query.DESCENDING).limit(TEST_LIMIT)
            post_ids = [d.id for d in q.stream()]
            print(f"Limiting to newest {len(post_ids)} posts.")
        except Exception:
            post_ids = list_post_ids(coll)
            post_ids = post_ids[:TEST_LIMIT]
            print(f"Fallback limit first {len(post_ids)} posts.")
    else:
        post_ids = list_post_ids(coll)

    total = embedded = skipped = failed = 0
    for pid in tqdm(post_ids):
        total += 1
        if SKIP_IF_EXISTS and already_embedded(pid):
            skipped += 1
            continue
        fetched = fetch_post_data(coll, pid)
        if not fetched:
            continue
        combined, title, summary = fetched
        emb = get_embedding(combined)
        if not emb:
            failed += 1
            continue
        if not DRY_RUN:
            embedding_collection.add(
                documents=[combined], ids=[pid], embeddings=[emb],
                metadatas=[{"subreddit": sub_lower, "title": title, "summary": summary}]
            )
        embedded += 1

    print(f"[{subreddit}] Total={total} New={embedded} Skipped={skipped} Fail={failed}")
    logging.info(f"{subreddit}: total={total} embedded={embedded} skipped={skipped} failed={failed}")

# ===== Main =====
if __name__ == "__main__":
    subreddits = ["TemasekPoly"]  # Add more after testing
    for s in subreddits:
        backfill(s)
    print("\n✅ Backfill complete.")

import firebase_admin
from firebase_admin import credentials, firestore
from vertexai.language_models import TextEmbeddingModel
import chromadb
from tqdm import tqdm

# --- Init Firebase ---
cred = credentials.Certificate("firebase-credentials.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# --- Init ChromaDB ---
chroma_client = chromadb.Client()
embedding_collection = chroma_client.get_or_create_collection("reddit_posts")

# --- Init Gemini Embedding Model ---
embedding_model = TextEmbeddingModel.from_pretrained("textembedding-gecko@001")

def get_embedding(text):
    try:
        return embedding_model.get_embeddings([text])[0].values
    except Exception as e:
        print(f"Error generating embedding: {e}")
        return None

def fetch_all_post_ids(collection_name):
    posts_ref = db.collection(collection_name)
    return [doc.id for doc in posts_ref.stream()]

def fetch_post_data(collection_name, post_id):
    post_ref = db.collection(collection_name).document(post_id)
    post_doc = post_ref.get()
    if not post_doc.exists:
        return None

    data = post_doc.to_dict()
    summary = data.get("summary", "")
    title = data.get("title", "")
    body = data.get("body", "")

    comments_ref = post_ref.collection("comments")
    comments = "\n".join([c.to_dict().get("body", "") for c in comments_ref.stream()])

    combined_text = f"{title}\n\n{body}\n\n{comments}\n\n{summary}"
    return combined_text, title, summary

def backfill_embeddings(subreddit_name):
    collection_name = "posts" if subreddit_name == "temasekpoly" else f"{subreddit_name.lower()}_posts"
    post_ids = fetch_all_post_ids(collection_name)
    print(f"[{subreddit_name}] Found {len(post_ids)} posts to backfill.")

    for post_id in tqdm(post_ids):
        try:
            # Check if already in ChromaDB
            existing = embedding_collection.get(ids=[post_id])
            if existing["ids"]:
                continue  # Skip already embedded

            data = fetch_post_data(collection_name, post_id)
            if not data:
                continue

            combined_text, title, summary = data
            embedding = get_embedding(combined_text)
            if not embedding:
                continue

            embedding_collection.add(
                documents=[combined_text],
                ids=[post_id],
                embeddings=[embedding],
                metadatas=[{
                    "subreddit": subreddit_name,
                    "title": title,
                    "summary": summary
                }]
            )
        except Exception as e:
            print(f"Failed to backfill for post {post_id}: {e}")

if __name__ == "__main__":
    subreddits = ["TemasekPoly", "sgexams", "NYP", "nanyangpoly", "republicpolytechnic", "SingaporePoly", "NgeeAnnPoly"]  # Replace with your list
    for subreddit in subreddits:
        backfill_embeddings(subreddit)

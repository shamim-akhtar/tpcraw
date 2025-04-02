import firebase_admin
from firebase_admin import credentials, firestore
import os
import re
import math
from dotenv import load_dotenv

load_dotenv()

# If you haven't already initialized Firebase in this file, do so:
if not firebase_admin._apps:
    cred = credentials.Certificate("firebase-credentials.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()

def detect_temasek_poly_related(text: str) -> bool:
    """
    Improved detection that matches 'TP' only if it’s a standalone word,
    plus 'Temasek Poly', 'Temasek Polytechnic', etc.
    """
    if not text:
        return False
    
    pattern = r"\btemasek polytechnic\b|\btemasekpoly\b|\btemasek poly\b|\btp\b"
    return bool(re.search(pattern, text, re.IGNORECASE))

def get_collections(subreddit_name: str):
    sub_lower = subreddit_name.lower()
    if sub_lower == "temasekpoly":
        return {
            "posts": db.collection("posts"),
            "authors": db.collection("authors"),
            "category_stats": db.collection("category_stats"),
        }
    else:
        return {
            'posts': db.collection(f"{sub_lower}_posts"),
            'authors': db.collection(f"{sub_lower}_authors"),
            'category_stats': db.collection(f"{sub_lower}_category_stats"),
        }

def patch_related_to_tp_for_subreddit(subreddit_name: str):
    """
    For a non-TemasekPoly subreddit, iterates all posts in Firestore,
    re-checks whether they are related to TP, and updates the 'relatedToTemasekPoly' field.
    """
    # Skip if it's actually 'TemasekPoly'
    if subreddit_name.lower() == "temasekpoly":
        print("Skipping TemasekPoly subreddit; no patching needed.")
        return

    # Access the correct Firestore collections
    refs = get_collections(subreddit_name)
    posts_collection = refs["posts"]

    # Gather all docs we need to update
    docs_to_update = []

    # Fetch all posts
    posts_stream = posts_collection.stream()
    count = 0
    for post_snapshot in posts_stream:
        post_data = post_snapshot.to_dict()
        post_id = post_snapshot.id

        # Combine post text. Typically 'title' + 'body' is enough:
        title = post_data.get("title", "")
        body = post_data.get("body", "")
        combined_text = f"{title}\n{body}"

        # Incorporate comments (which might contain “TP”)
        comments_stream = posts_collection.document(post_id).collection("comments").stream()
        for c_snap in comments_stream:
            c_data = c_snap.to_dict()
            combined_text += "\n" + c_data.get("body", "")

        # Determine new value
        new_val = detect_temasek_poly_related(combined_text)

        # Compare to current Firestore value
        current_val = post_data.get("relatedToTemasekPoly")
        if current_val != new_val:
            docs_to_update.append((post_snapshot.reference, new_val))

    #print(f"[{subreddit_name}] Patched 'relatedToTemasekPoly' in {count} posts.")
    print(f"[{subreddit_name}] Found {len(docs_to_update)} docs needing an update.")

    # Batch update in chunks of 500
    chunk_size = 500
    total_updated = 0

    for i in range(0, len(docs_to_update), chunk_size):
        chunk = docs_to_update[i:i + chunk_size]
        batch = db.batch()

        for doc_ref, is_related in chunk:
            batch.update(doc_ref, {"relatedToTemasekPoly": is_related})

        batch.commit()  # commit this chunk
        total_updated += len(chunk)

    print(f"[{subreddit_name}] Successfully patched {total_updated} documents.")

# --------------------
#  EXAMPLE USAGE
# --------------------
if __name__ == "__main__":
    # Suppose you have multiple subreddits to patch:
    subreddits_to_patch = ["sgExams"]

    for sb in subreddits_to_patch:
        patch_related_to_tp_for_subreddit(sb)

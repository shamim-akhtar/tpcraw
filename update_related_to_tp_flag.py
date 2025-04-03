import firebase_admin
from firebase_admin import credentials, firestore
import os
import re
# import math # Not used in this script
from dotenv import load_dotenv
import time # For timing and progress

load_dotenv()

# --- Constants ---
BATCH_WRITE_SIZE = 500 # Max operations per batch write is 500

# --- Firebase Initialization ---
# Consider adding more robust error handling if initialization fails
if not firebase_admin._apps:
    try:
        cred = credentials.Certificate("firebase-credentials.json")
        firebase_admin.initialize_app(cred)
        print("Firebase Initialized Successfully.")
    except Exception as e:
        print(f"CRITICAL: Failed to initialize Firebase: {e}")
        # Potentially log the error to a file as well
        exit() # Exit if Firebase can't connect

db = firestore.client()

# --- Helper Functions ---
def detect_temasek_poly_related(text: str) -> bool:
    """
    Improved detection that matches 'TP' only if it’s a standalone word,
    plus 'Temasek Poly', 'Temasek Polytechnic', etc. Case-insensitive.
    """
    if not text:
        return False
    # Use word boundaries (\b) to ensure 'TP' isn't matched within other words
    pattern = r"\btemasek polytechnic\b|\btemasekpoly\b|\btemasek poly\b|\btp\b"
    return bool(re.search(pattern, text, re.IGNORECASE))

def get_collections(subreddit_name: str):
    """Gets Firestore collection references based on subreddit name."""
    sub_lower = subreddit_name.lower()
    # Define collection names based on subreddit
    # Assuming 'posts' for temasekpoly and '{sub}_posts' otherwise
    posts_collection_name = "posts" if sub_lower == "temasekpoly" else f"{sub_lower}_posts"

    # Add other collections if needed by other parts of your potential scripts
    # authors_collection_name = "authors" if sub_lower == "temasekpoly" else f"{sub_lower}_authors"
    # category_stats_collection_name = "category_stats" if sub_lower == "temasekpoly" else f"{sub_lower}_category_stats"

    # This patch script only needs the posts collection
    return {
        "posts": db.collection(posts_collection_name),
        # "authors": db.collection(authors_collection_name),
        # "category_stats": db.collection(category_stats_collection_name),
    }

# --- Optimized Patch Function ---
def patch_related_to_tp_for_subreddit_optimized(subreddit_name: str):
    """
    Optimized: For a non-TemasekPoly subreddit, iterates posts,
    re-checks relatedness (short-circuiting comment reads), and updates field.
    Uses batched writes for efficiency.
    """
    if subreddit_name.lower() == "temasekpoly":
        print(f"Skipping r/TemasekPoly subreddit; no patching needed.")
        return

    print(f"--- Starting patch for r/{subreddit_name} ---")
    start_time = time.time()

    refs = get_collections(subreddit_name)
    posts_collection = refs["posts"]

    docs_to_update = [] # Store tuples of (doc_ref, new_boolean_value)
    total_posts_processed = 0
    posts_checked_comments = 0 # Track how many times we actually needed to read comments
    read_errors = 0

    try:
        posts_stream = posts_collection.stream()

        # --- Read and Analysis Phase ---
        print(f"[{subreddit_name}] Starting read and analysis phase...")
        for post_snapshot in posts_stream:
            total_posts_processed += 1
            if total_posts_processed % 1000 == 0: # Progress indicator
                elapsed = time.time() - start_time
                print(f"[{subreddit_name}] Processed {total_posts_processed} posts... ({elapsed:.2f}s elapsed)")

            try:
                # Ensure document data exists
                post_data = post_snapshot.to_dict()
                if not post_data:
                     print(f"WARN: Skipping empty document snapshot: {post_snapshot.id}")
                     continue

                post_id = post_snapshot.id
                doc_ref = post_snapshot.reference # Get reference for potential update
                current_val = post_data.get("relatedToTemasekPoly") # Get current value once

                title = post_data.get("title", "")
                body = post_data.get("body", "")
                title_body_text = f"{title}\n{body}"

                # --- Optimization: Check title/body first ---
                is_related = detect_temasek_poly_related(title_body_text)

                # If not related based on title/body, THEN check comments
                if not is_related:
                    posts_checked_comments += 1
                    comments_text = ""
                    try:
                         # Fetch comments ONLY if needed
                         comments_stream = doc_ref.collection("comments").stream()
                         comment_bodies = [
                             c_snap.to_dict().get("body", "")
                             for c_snap in comments_stream if c_snap.exists and c_snap.to_dict()
                         ]
                         comments_text = "\n".join(filter(None, comment_bodies)) # Join non-empty bodies

                    except Exception as comment_e:
                         print(f"WARN: Error fetching/processing comments for post {post_id}: {comment_e}")
                         # Decide how to handle: proceed without comments? log? retry?
                         # For a patch, proceeding without comments is often acceptable.

                    # Check combined text if comments were read
                    if comments_text:
                         # Re-check with comments included
                         is_related = detect_temasek_poly_related(title_body_text + "\n" + comments_text)
                    # else: is_related remains False from title/body check

                # --- Compare final result and add to batch if needed ---
                # Check explicitly for None to handle cases where field didn't exist
                if current_val is None or current_val != is_related:
                    docs_to_update.append((doc_ref, is_related))

            except Exception as post_e:
                read_errors += 1
                print(f"ERROR: Failed to process post {post_snapshot.id}: {post_e}")
                # Log this error more formally if needed
                continue # Skip to next post

    except Exception as stream_e:
        print(f"ERROR: Failed to stream posts for r/{subreddit_name}: {stream_e}")
        # The script probably cannot proceed if the stream fails
        return # Exit the function for this subreddit

    read_end_time = time.time()
    print(f"[{subreddit_name}] Finished reading/analysis phase.")
    print(f"[{subreddit_name}] Total posts processed: {total_posts_processed}")
    print(f"[{subreddit_name}] Posts where comments were checked: {posts_checked_comments}")
    print(f"[{subreddit_name}] Read errors encountered: {read_errors}")
    print(f"[{subreddit_name}] Found {len(docs_to_update)} documents requiring an update.")
    print(f"[{subreddit_name}] Read/analysis phase took {read_end_time - start_time:.2f} seconds.")

    # --- Batch Update Phase ---
    total_updated = 0
    write_errors = 0
    print(f"[{subreddit_name}] Starting batched writes...")
    if not docs_to_update:
        print(f"[{subreddit_name}] No documents require updates.")
    else:
        for i in range(0, len(docs_to_update), BATCH_WRITE_SIZE):
            batch_start_time = time.time()
            chunk = docs_to_update[i:i + BATCH_WRITE_SIZE]
            batch = db.batch()
            added_to_batch = 0
            for doc_ref, related_flag in chunk:
                try:
                     # Ensure related_flag is boolean, default to False if somehow invalid
                     final_flag = bool(related_flag)
                     batch.update(doc_ref, {"relatedToTemasekPoly": final_flag})
                     added_to_batch += 1
                except Exception as batch_add_e:
                     # Log which doc failed to be added to batch
                     print(f"ERROR: Failed to add update for {doc_ref.id} to batch {i // BATCH_WRITE_SIZE + 1}: {batch_add_e}")
                     write_errors += 1

            if added_to_batch > 0:
                try:
                    batch.commit()
                    total_updated += added_to_batch
                    batch_time = time.time() - batch_start_time
                    print(f"[{subreddit_name}] Committed batch {i // BATCH_WRITE_SIZE + 1} ({added_to_batch} ops) in {batch_time:.2f}s. Total updated: {total_updated}/{len(docs_to_update)}")
                except Exception as commit_e:
                    print(f"ERROR: COMMIT FAILED for batch {i // BATCH_WRITE_SIZE + 1}: {commit_e}")
                    # How many failed? Assume all in batch for error count, though some might have succeeded before failure
                    write_errors += added_to_batch
                    # Consider more sophisticated retry logic or saving failed batches?
                    # For a one-time patch, logging might be sufficient.
            else:
                 print(f"[{subreddit_name}] Skipped committing empty batch {i // BATCH_WRITE_SIZE + 1}.")


    write_end_time = time.time()
    print(f"[{subreddit_name}] Write phase finished.")
    print(f"[{subreddit_name}] Successfully committed updates for {total_updated} documents.")
    print(f"[{subreddit_name}] Write errors encountered (individual add or commit failures): {write_errors}")
    print(f"[{subreddit_name}] Write phase took {write_end_time - read_end_time:.2f} seconds.")
    print(f"--- Finished patch for r/{subreddit_name} in {write_end_time - start_time:.2f} seconds ---")

# --------------------
#  EXAMPLE USAGE
# --------------------
if __name__ == "__main__":
    # List of subreddits (lowercase) to patch - EXCLUDE 'temasekpoly'
    subreddits_to_patch = ["sgexams"] # Add other relevant subreddit names

    overall_start_time = time.time()
    print(f"Starting patch script at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Target subreddits: {subreddits_to_patch}")
    print("-" * 30)

    for sb_name in subreddits_to_patch:
        patch_related_to_tp_for_subreddit_optimized(sb_name.lower()) # Ensure lowercase name is used
        print("-" * 30)

    overall_end_time = time.time()
    print(f"Script finished at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total script execution time: {overall_end_time - overall_start_time:.2f} seconds.")
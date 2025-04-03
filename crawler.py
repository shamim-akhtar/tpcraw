import math
import praw
import os
import datetime
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore
import google.generativeai as genai
import time
import logging
import re
from collections import defaultdict # Added for easier aggregation
# from google.cloud import firestore

# --- Constants ---
BATCH_COMMIT_SIZE = 400 # Max operations per batch is 500, use a lower number for safety

# Setup logging to file
logging.basicConfig(filename='crawler_errors.log',
                    level=logging.ERROR,
                    format='%(asctime)s %(levelname)s: %(message)s')

# Load environment variables
load_dotenv()

# Reddit API credentials
REDDIT_CLIENT_ID = os.getenv('REDDIT_CLIENT_ID')
REDDIT_CLIENT_SECRET = os.getenv('REDDIT_CLIENT_SECRET')
REDDIT_USER_AGENT = os.getenv('REDDIT_USER_AGENT')
GOOGLE_GEMINI_API_KEY = os.getenv('GOOGLE_GEMINI_API_KEY')

# Initialize the Reddit API using PRAW
reddit = praw.Reddit(
    client_id=REDDIT_CLIENT_ID,
    client_secret=REDDIT_CLIENT_SECRET,
    user_agent=REDDIT_USER_AGENT
)

# Initialize Firebase Firestore
try:
    cred = credentials.Certificate("firebase-credentials.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Firebase Initialized Successfully.")
except Exception as e:
    logging.error(f"Failed to initialize Firebase: {e}")
    print(f"CRITICAL: Failed to initialize Firebase: {e}")
    exit() # Exit if Firebase can't connect

# Load subreddit list from configuration file
def load_subreddits(file_path='subreddits.txt'):
    try:
        with open(file_path, 'r') as file:
            subreddits = [line.strip().lower() for line in file if line.strip()]
        print(f"Loaded subreddits: {subreddits}")
        return subreddits
    except Exception as e:
        logging.error(f"Failed to load subreddits from {file_path}: {e}")
        print(f"ERROR: Failed to load subreddits from {file_path}: {e}")
        return []

def detect_temasek_poly_related(text: str) -> bool:
    """
    Returns True if the text mentions Temasek Polytechnic in some form.
    Uses regex word boundaries (\b) so that 'TP' is matched only as
    a standalone word, rather than a substring of, say, "watpad."
    """
    if not text:
        return False
    pattern = r"\btemasek polytechnic\b|\btemasekpoly\b|\btemasek poly\b|\btp\b"
    return bool(re.search(pattern, text, re.IGNORECASE))

def get_last_timestamp(subreddit):
    """Fetch the last crawled timestamp for a given subreddit from Firestore."""
    doc_id = f"last_timestamp_{subreddit}"
    try:
        doc = db.collection("meta").document(doc_id).get()
        if doc.exists:
            return doc.to_dict().get("value", 0)
    except Exception as e:
        logging.error(f"[{subreddit}] Error fetching last_timestamp: {e}")
    return 0

def get_collections(subreddit_name: str):
    """
    Returns a dictionary of Firestore collection references for posts, authors,
    and category_stats, depending on whether the subreddit is 'TemasekPoly' or something else.
    """
    sub_lower = subreddit_name.lower()
    # Define collection names based on subreddit
    posts_collection_name = "posts" if sub_lower == "temasekpoly" else f"{sub_lower}_posts"
    authors_collection_name = "authors" if sub_lower == "temasekpoly" else f"{sub_lower}_authors"
    category_stats_collection_name = "category_stats" if sub_lower == "temasekpoly" else f"{sub_lower}_category_stats"

    return {
        "posts": db.collection(posts_collection_name),
        "authors": db.collection(authors_collection_name),
        "category_stats": db.collection(category_stats_collection_name),
        "meta": db.collection("meta") # Assuming meta is global or adjust if needed
    }

def set_last_timestamp(timestamp, subreddit, refs):
    """Store the last crawled timestamp for a given subreddit in Firestore."""
    doc_id = f"last_timestamp_{subreddit}"
    try:
        refs["meta"].document(doc_id).set({"value": timestamp})
    except Exception as e:
        logging.error(f"[{subreddit}] Error saving last_timestamp: {e}")

# Helper function to safely generate content with retries
def safe_generate_content(model, prompt, retries=3, delay=5):
    for attempt in range(retries):
        try:
            response = model.generate_content(prompt)
            # Check for valid response and text content
            if response and hasattr(response, 'text') and response.text:
                return response.text.strip()
            # Handle potential blocking or safety issues
            elif response and hasattr(response, 'prompt_feedback') and response.prompt_feedback.block_reason:
                 logging.warning(f"Content generation blocked. Reason: {response.prompt_feedback.block_reason}")
                 return "Content generation blocked due to safety settings." # Return specific message
            else:
                # General case for empty or unexpected response structure
                raise ValueError(f"Empty or invalid response structure received. Response: {response}")

        except Exception as e:
            logging.error(f"Error in generate_content (Attempt {attempt+1}/{retries}): {e}. Prompt snippet: {prompt[:100]}...")
            if attempt < retries - 1:
                time.sleep(delay)
            else:
                 logging.error(f"generate_content failed after {retries} attempts.")
    # Return a fallback message if all retries fail
    return "Error generating response after multiple attempts."

# OPTIMIZED: Accumulate author stats in memory
def update_author_stats_memory(author_updates, author, sentiment, is_post=True, post_id=None, comment_id=None):
    """
    Updates author statistics in the provided in-memory dictionary.
    Tracks cumulative changes to be written later.
    """
    if not author or author.lower() == '[deleted]': # Skip deleted authors
        return

    # Initialize author data if not present
    if author not in author_updates:
        author_updates[author] = {
            "deltaSentimentScore": 0,
            "deltaPostCount": 0,
            "deltaCommentCount": 0,
            "deltaNegativeCount": 0,
            "deltaPositiveCount": 0,
            "newPosts": set(), # Use sets for efficient unique additions
            "newComments": defaultdict(set) # {post_id: {comment_id1, comment_id2}}
        }

    stats = author_updates[author]

    # Update delta sentiment score
    stats["deltaSentimentScore"] += sentiment

    # Increment positive/negative counts
    if sentiment > 0:
        stats["deltaPositiveCount"] += 1
    elif sentiment < 0:
        stats["deltaNegativeCount"] += 1

    # Update post/comment counts and references
    if is_post:
        stats["deltaPostCount"] += 1
        if post_id:
            stats["newPosts"].add(post_id)
    else:
        stats["deltaCommentCount"] += 1
        if post_id and comment_id:
            stats["newComments"][post_id].add(comment_id)

# OPTIMIZED: Write aggregated author stats using Batch
def commit_author_stats(author_updates, refs):
    """
    Writes aggregated author statistics from memory to Firestore using batches.
    Fetches existing data and merges updates.
    """
    if not author_updates:
        return

    print(f"Committing stats for {len(author_updates)} authors...")
    authors_ref = refs["authors"]
    batch = db.batch()
    count = 0

    authors_to_fetch = list(author_updates.keys())
    existing_authors_data = {}

    # Fetch existing author documents efficiently (Firestore limits `in` queries to 30 items)
    for i in range(0, len(authors_to_fetch), 30):
         chunk = authors_to_fetch[i:i+30]
         try:
            docs = authors_ref.where(firestore.FieldPath.document_id(), "in", chunk).stream()
            for doc in docs:
                existing_authors_data[doc.id] = doc.to_dict()
         except Exception as e:
            logging.error(f"Error fetching author chunk {i//30 + 1}: {e}")


    for author, updates in author_updates.items():
        author_ref = authors_ref.document(author)

        # Get existing stats or initialize default
        current_stats = existing_authors_data.get(author, {})
        if not current_stats: # Author is new or fetch failed
             current_stats = {
                "totalSentimentScore": 0, "postCount": 0, "commentCount": 0,
                "negativeCount": 0, "positiveCount": 0, "averageSentiment": 0,
                "posts": [], "comments": {}
            }

        # Ensure lists/dicts exist if fetched doc is missing them
        current_stats.setdefault("posts", [])
        current_stats.setdefault("comments", {})
        current_stats.setdefault("totalSentimentScore", 0)
        current_stats.setdefault("postCount", 0)
        current_stats.setdefault("commentCount", 0)
        current_stats.setdefault("negativeCount", 0)
        current_stats.setdefault("positiveCount", 0)

        # Apply deltas
        current_stats["totalSentimentScore"] += updates["deltaSentimentScore"]
        current_stats["postCount"] += updates["deltaPostCount"]
        current_stats["commentCount"] += updates["deltaCommentCount"]
        current_stats["negativeCount"] += updates["deltaNegativeCount"]
        current_stats["positiveCount"] += updates["deltaPositiveCount"]

        # Merge new post IDs (convert set to list for Firestore)
        existing_post_set = set(current_stats["posts"])
        existing_post_set.update(updates["newPosts"])
        current_stats["posts"] = sorted(list(existing_post_set)) # Store sorted list

        # Merge new comment IDs (convert sets to lists for Firestore)
        for post_id, comment_ids_set in updates["newComments"].items():
            current_stats["comments"].setdefault(post_id, [])
            existing_comment_set = set(current_stats["comments"][post_id])
            existing_comment_set.update(comment_ids_set)
            current_stats["comments"][post_id] = sorted(list(existing_comment_set)) # Store sorted list


        # Recalculate average sentiment
        total_interactions = current_stats["postCount"] + current_stats["commentCount"]
        current_stats["averageSentiment"] = (current_stats["totalSentimentScore"] / total_interactions) if total_interactions > 0 else 0

        # Add update to batch
        batch.set(author_ref, current_stats) # Use set to overwrite completely with merged data
        count += 1

        # Commit batch if size limit reached
        if count >= BATCH_COMMIT_SIZE:
            try:
                print(f"Committing author batch ({count} operations)...")
                batch.commit()
                print("Author batch committed.")
                batch = db.batch() # Start new batch
                count = 0
            except Exception as e:
                logging.error(f"Error committing author batch: {e}")
                # Consider retry logic or partial failure handling here
                batch = db.batch() # Start new batch even on error
                count = 0


    # Commit any remaining operations in the last batch
    if count > 0:
        try:
            print(f"Committing final author batch ({count} operations)...")
            batch.commit()
            print("Final author batch committed.")
        except Exception as e:
            logging.error(f"Error committing final author batch: {e}")

def update_category_stats_memory(category_updates, date_str, category, sentiment, post_id=None, comment_id=None):
    """
    Accumulates category stats changes in memory so they can be written
    to Firestore in bulk. Mirrors the structure in the unoptimized
    'update_category_stats_incremental' function.

    category_updates is a dictionary keyed by (date_str, category), e.g.:
       category_updates[(date_str, category)] = {
           "deltaSentiment": 0,
           "deltaCount": 0,
           "deltaPositiveCount": 0,
           "deltaNegativeCount": 0,
           "newPostIds": set(),
           "newComments": defaultdict(set),
       }

    The final Firestore document (for each date_str) has the form:
       {
         "<category>": {
             "totalSentiment": ...,
             "count": ...,
             "positiveCount": ...,
             "negativeCount": ...,
             "averageSentiment": ...,
             "postIds": [...],
             "comments": {
                 "<post_id>": ["<comment_id>", ...]
             }
         },
         ...other categories...
       }
    """

    # If there is no category or no date, do nothing
    if not category or not date_str:
        return

    # (date_str, category) is our 'key' for grouping changes in memory
    key = (date_str, category)

    # If there's no record yet for this (date_str, category), initialize
    if key not in category_updates:
        category_updates[key] = {
            "deltaSentiment": 0,
            "deltaCount": 0,
            "deltaPositiveCount": 0,
            "deltaNegativeCount": 0,
            # We store new post/comment IDs in sets for easy de-duplication
            "newPostIds": set(),
            "newComments": defaultdict(set),
        }

    cat_data = category_updates[key]

    # Increment total sentiment and count
    cat_data["deltaSentiment"] += sentiment
    cat_data["deltaCount"] += 1

    # Increment positive/negative counts
    if sentiment > 0:
        cat_data["deltaPositiveCount"] += 1
    elif sentiment < 0:
        cat_data["deltaNegativeCount"] += 1

    # Track any new post or comment IDs for merging later
    if post_id:
        cat_data["newPostIds"].add(post_id)

        if comment_id:
            cat_data["newComments"][post_id].add(comment_id)


# Make sure you have the necessary import near the top:
# from google.cloud import firestore # If using direct client init
# or
# from firebase_admin import firestore # If using admin sdk init

def commit_category_stats_non_transactional(category_updates, refs):
    """
    Writes aggregated category statistics NON-TRANSACTIONALLY.
    Checks if the document exists.
    - If exists: Uses atomic increments/ArrayUnion via update().
    - If not exists: Creates the document via set() with initial values.
    The 'comments' map is updated non-atomically in both cases.
    """
    if not category_updates:
        return

    print(f"Committing stats for {len(category_updates)} category-date pairs NON-TRANSACTIONALLY...")
    category_stats_ref = refs["category_stats"]

    # Group updates by date string first (same as before)
    updates_grouped_by_date = defaultdict(dict)
    for (date_str, category), updates in category_updates.items():
        updates_grouped_by_date[date_str][category] = updates

    # Process each date's updates
    for date_str, date_updates in updates_grouped_by_date.items():
        doc_ref = category_stats_ref.document(date_str)
        doc_exists = False
        current_doc_data = {} # Needed for comments merge regardless of existence

        # --- Step 1: Check existence and get current data for comments merge ---
        try:
            snapshot = doc_ref.get()
            doc_exists = snapshot.exists
            if doc_exists:
                current_doc_data = snapshot.to_dict()
            print(f"[{date_str}] Checked document existence. Exists: {doc_exists}")
        except Exception as e:
             # Log error but proceed, assuming doc doesn't exist for safety
             logging.error(f"Non-transactional commit: Failed initial get for doc {date_str}: {e}")
             print(f"WARN: [{date_str}] Failed to check doc existence, proceeding as if it doesn't exist: {e}")
             doc_exists = False
             current_doc_data = {}

        # --- Step 2: Prepare updates (payloads differ based on existence) ---
        update_payload = {} # For update() if doc exists
        create_payload = {} # For set() if doc does not exist
        merged_comments_for_doc = {} # Store category-specific merged comments for this date doc

        for category, updates in date_updates.items():
            # --- Prepare merged comments (needed for both create and update) ---
            current_category_data = current_doc_data.get(category, {})
            merged_comments_for_category = current_category_data.get("comments", {})
            new_comments_to_add = updates.get("newComments", {})

            if new_comments_to_add:
                for post_id, comment_ids_set_to_add in new_comments_to_add.items():
                    merged_comments_for_category.setdefault(post_id, [])
                    existing_comment_set = set(merged_comments_for_category.get(post_id, []))
                    existing_comment_set.update(comment_ids_set_to_add)
                    merged_comments_for_category[post_id] = sorted(list(existing_comment_set))
                merged_comments_for_doc[category] = merged_comments_for_category # Store for later use
            # --- End of comments merge ---


            if doc_exists:
                # --- Prepare payload for UPDATE ---
                category_path_prefix = f"{category}."
                if updates.get("deltaSentiment", 0) != 0:
                    update_payload[f"{category_path_prefix}totalSentiment"] = firestore.Increment(updates["deltaSentiment"])
                if updates.get("deltaCount", 0) != 0:
                    update_payload[f"{category_path_prefix}count"] = firestore.Increment(updates["deltaCount"])
                if updates.get("deltaPositiveCount", 0) != 0:
                    update_payload[f"{category_path_prefix}positiveCount"] = firestore.Increment(updates["deltaPositiveCount"])
                if updates.get("deltaNegativeCount", 0) != 0:
                    update_payload[f"{category_path_prefix}negativeCount"] = firestore.Increment(updates["deltaNegativeCount"])

                new_post_ids_list = list(updates.get("newPostIds", set()))
                if new_post_ids_list:
                     update_payload[f"{category_path_prefix}postIds"] = firestore.ArrayUnion(new_post_ids_list)

                # Add merged comments for this category to the update payload
                if category in merged_comments_for_doc:
                    update_payload[f"{category_path_prefix}comments"] = merged_comments_for_doc[category]

            else:
                # --- Prepare payload for CREATE (set) ---
                # Calculate initial values directly from deltas
                totalSentiment = updates.get("deltaSentiment", 0)
                count = updates.get("deltaCount", 0)
                positiveCount = updates.get("deltaPositiveCount", 0)
                negativeCount = updates.get("deltaNegativeCount", 0)
                postIds = sorted(list(updates.get("newPostIds", set())))
                comments = merged_comments_for_doc.get(category, {}) # Use already merged comments for this batch
                averageSentiment = (totalSentiment / count) if count > 0 else 0

                # Ensure category exists in create_payload
                if category not in create_payload:
                     create_payload[category] = {}

                create_payload[category] = {
                    "totalSentiment": totalSentiment,
                    "count": count,
                    "positiveCount": positiveCount,
                    "negativeCount": negativeCount,
                    "averageSentiment": averageSentiment, # Calculate initial average
                    "postIds": postIds,
                    "comments": comments
                }

        # --- Step 3: Perform the database operation ---
        if doc_exists:
            if update_payload:
                try:
                    print(f"[{date_str}] Applying non-transactional UPDATE with {len(update_payload)} fields...")
                    doc_ref.update(update_payload)
                    print(f"[{date_str}] Non-transactional UPDATE applied successfully.")
                except Exception as e:
                    logging.error(f"Failed non-transactional UPDATE for date {date_str}: {e}", exc_info=True)
                    print(f"ERROR: Failed non-transactional UPDATE for date {date_str}: {e}")
            else:
                 print(f"[{date_str}] No update payload generated for existing doc.")
        else: # Document does not exist
            if create_payload:
                try:
                    print(f"[{date_str}] Applying non-transactional CREATE with SET for {len(create_payload)} categories...")
                    doc_ref.set(create_payload) # Use set() to create the document
                    print(f"[{date_str}] Non-transactional CREATE applied successfully.")
                except Exception as e:
                    logging.error(f"Failed non-transactional CREATE for date {date_str}: {e}", exc_info=True)
                    print(f"ERROR: Failed non-transactional CREATE for date {date_str}: {e}")
            else:
                print(f"[{date_str}] No create payload generated for new doc.")


# Main crawling function
def crawl_subreddit(subreddit_name, model):
    print(f"\n--- Starting crawl for r/{subreddit_name} ---")
    last_timestamp = get_last_timestamp(subreddit_name)
    print(f"[{subreddit_name}] Last timestamp: {datetime.datetime.fromtimestamp(last_timestamp)} ({last_timestamp})")
    new_last_timestamp = last_timestamp

    refs = get_collections(subreddit_name)
    sub = reddit.subreddit(subreddit_name)

    updated_posts_count = 0
    processed_comments_count = 0
    new_comments_on_old_posts_count = 0

    # --- In-memory stores for aggregation ---
    author_updates = defaultdict(lambda: { # Use defaultdict for easier initialization
        "deltaSentimentScore": 0, "deltaPostCount": 0, "deltaCommentCount": 0,
        "deltaNegativeCount": 0, "deltaPositiveCount": 0,
        "newPosts": set(), "newComments": defaultdict(set)
    })
    category_updates = defaultdict(lambda: { # Key: (date_str, category)
         "deltaSentiment": 0, "deltaCount": 0, "deltaPositiveCount": 0, "deltaNegativeCount": 0,
         "newPostIds": set(), "newComments": defaultdict(set)
    })
    # ---

    try:
        # =============================================
        # 1. Process NEW posts and their comments
        # =============================================
        print(f"[{subreddit_name}] Fetching new submissions...")
        for submission in sub.new(limit=500): # Adjust limit as needed
            submission_time = submission.created_utc
            if submission_time <= last_timestamp:
                # print(f"[{subreddit_name}] Skipping post {submission.id} (already processed or older)")
                continue # Skip already processed posts

            # Update the latest timestamp seen in this run
            if submission_time > new_last_timestamp:
                new_last_timestamp = submission_time

            print(f"[{subreddit_name}] Processing NEW post: {submission.id} : {submission.title[:50]}...")

            try:
                # --- Prepare Post Data ---
                post_id = submission.id
                post_author = str(submission.author) if submission.author else "[deleted]"
                post_created_dt = datetime.datetime.fromtimestamp(submission_time)
                post_date_str = post_created_dt.strftime("%Y-%m-%d")

                # Initial post doc (summary, sentiment etc. will be added after comment processing)
                post_doc = {
                    "subreddit": subreddit_name,
                    "title": submission.title,
                    "author": post_author,
                    "created": post_created_dt,
                    "body": submission.selftext,
                    "score": submission.score,
                    "URL": submission.url,
                    # Placeholders - will be updated later in one go
                    "summary": "", "engagementScore": 0.0, "rawSentimentScore": 0.0,
                    "weightedSentimentScore": 0.0, "category": "Uncategorized", "emotion": "Neutral",
                    "sentiment": 0, "iit": "no", "relatedToTemasekPoly": False,
                    "totalComments": 0, "totalPositiveSentiments": 0, "totalNegativeSentiments": 0
                }

                # --- Process Comments ---
                comments_data = [] # Store comment data temporarily
                combined_post_comments = submission.selftext # Start summary text with post body

                print(f"[{subreddit_name}] Fetching comments for post {post_id}...")
                submission.comments.replace_more(limit=None) # Fetch all comments
                all_comments = submission.comments.list()
                print(f"[{subreddit_name}] Got {len(all_comments)} comments for post {post_id}.")


                weighted_sentiment_sum = 0.0
                total_weight = 0.0
                raw_sentiment_score_agg = 0.0 # Renamed to avoid clash with post_doc field
                total_comments_agg = 0       # Renamed
                total_positive_sentiments_agg = 0 # Renamed
                total_negative_sentiments_agg = 0 # Renamed

                # Use a batch for writing comments of this post
                comment_batch = db.batch()
                comment_write_count = 0

                for comment in all_comments:
                    if not hasattr(comment, 'body') or not hasattr(comment, 'id') or not hasattr(comment, 'author'):
                        logging.warning(f"[{subreddit_name}] Skipping malformed comment object in post {post_id}")
                        continue # Skip deleted comments or malformed objects

                    comment_id = comment.id
                    comment_author = str(comment.author) if comment.author else "[deleted]"
                    comment_body = comment.body
                    comment_score = comment.score
                    comment_created_dt = datetime.datetime.fromtimestamp(comment.created_utc) if hasattr(comment, 'created_utc') else post_created_dt # Fallback
                    comment_date_str = comment_created_dt.strftime("%Y-%m-%d")

                    combined_post_comments += f"\n{comment_body}" # Append for overall summary/sentiment

                    # --- Gemini Analysis for Comment ---
                    prompt = f"""
                    Analyze the following Reddit comment.
                    Provide output as: <sentiment_score>,<emotion>,<category>,<iit_flag>
                    - sentiment_score: 1 (positive), -1 (negative), 0 (neutral)
                    - emotion: happy, relief, stress, frustration, pride, disappointment, confusion, neutral
                    - category: academic, exams, facilities, subjects, administration, career, admission, results, internship, lecturer, student life, infrastructure, classroom, events, CCA, other
                    - iit_flag: yes (related to School of IIT/Informatics & IT programs, including diplomas such as Big Data Analytics/BDA, 
                    Applied Artificial Intelligence/AAI,
                    Information Technology,
                    Cyber Security & Digital Forensics/CDF,
                    Immersive Media & Game Development/IGD
                    ) or no
                    Text: "{comment_body}"
                    """
                    response_text = safe_generate_content(model, prompt)
                    parts = response_text.split(',')

                    # Default values in case of parsing failure
                    sentiment = 0
                    emotion = "Neutral"
                    category = "Uncategorized" # Default category
                    iit_flag = "no"

                    if len(parts) >= 4:
                        try:
                            sentiment = int(parts[0].strip())
                        except ValueError:
                            logging.warning(f"[{subreddit_name}] Failed to parse sentiment for comment {comment_id} in post {post_id}. Response: {response_text}")
                        emotion = parts[1].strip() if parts[1].strip() else "Neutral"
                        category = parts[2].strip().lower() if parts[2].strip() else "Uncategorized" # Use lower case consistently
                        iit_flag = parts[3].strip().lower() if parts[3].strip().lower() in ["yes", "no"] else "no"
                    else:
                         logging.warning(f"[{subreddit_name}] Unexpected Gemini response format for comment {comment_id}. Response: {response_text}")


                    # --- Aggregate Comment Stats ---
                    weight = 1 + math.log2(max(comment_score, 0) + 1)
                    weighted_sentiment_sum += sentiment * weight
                    total_weight += weight
                    raw_sentiment_score_agg += sentiment
                    total_comments_agg += 1
                    processed_comments_count += 1

                    if sentiment > 0:
                        total_positive_sentiments_agg += sentiment # Summing the scores (e.g., all +1s)
                    elif sentiment < 0:
                        total_negative_sentiments_agg += sentiment # Summing the scores (e.g., all -1s)

                    # --- Prepare Comment Document for Batch ---
                    comment_doc = {
                        "body": comment_body,
                        "author": comment_author,
                        "created": comment_created_dt,
                        "score": comment_score,
                        "sentiment": sentiment,
                        "emotion": emotion,
                        "category": category,
                        "iit": iit_flag,
                        # Add parent post id if needed for easier querying, though structure implies it
                        # "postId": post_id
                    }
                    comment_ref = refs["posts"].document(post_id).collection("comments").document(comment_id)
                    comment_batch.set(comment_ref, comment_doc)
                    comment_write_count += 1

                    # --- Update In-Memory Aggregations ---
                    update_author_stats_memory(author_updates, comment_author, sentiment, is_post=False, post_id=post_id, comment_id=comment_id)
                    update_category_stats_memory(category_updates, comment_date_str, category, sentiment, post_id=post_id, comment_id=comment_id)

                    # Commit comment batch periodically if needed (unlikely for single post)
                    if comment_write_count >= BATCH_COMMIT_SIZE:
                         print(f"[{subreddit_name}] Committing intermediate comment batch for post {post_id} ({comment_write_count} ops)...")
                         try:
                             comment_batch.commit()
                             print(f"[{subreddit_name}] Intermediate comment batch committed.")
                             comment_batch = db.batch() # New batch
                             comment_write_count = 0
                         except Exception as e:
                             logging.error(f"[{subreddit_name}] Error committing intermediate comment batch for post {post_id}: {e}")
                             comment_batch = db.batch() # Reset batch on error
                             comment_write_count = 0


                # Commit remaining comments for the post
                if comment_write_count > 0:
                    print(f"[{subreddit_name}] Committing final comment batch for post {post_id} ({comment_write_count} ops)...")
                    try:
                        comment_batch.commit()
                        print(f"[{subreddit_name}] Final comment batch committed for post {post_id}.")
                    except Exception as e:
                         logging.error(f"[{subreddit_name}] Error committing final comment batch for post {post_id}: {e}")


                # --- Gemini Analysis for Overall Post (incl. comments) ---
                print(f"[{subreddit_name}] Analyzing overall post {post_id}...")
                prompt_overall = f"""
                Analyze the following Reddit post and its comments.
                Provide output as: <sentiment_score>,<emotion>,<category>,<iit_flag>
                - sentiment_score: 1 (positive), -1 (negative), 0 (neutral)
                - emotion: happy, relief, stress, frustration, pride, disappointment, confusion, neutral
                - category: academic, exams, facilities, subjects, administration, career, admission, results, internship, lecturer, student life, infrastructure, classroom, events, CCA, other
                - iit_flag: yes (related to School of IIT/Informatics & IT programs, including diplomas such as Big Data Analytics/BDA, 
                Applied Artificial Intelligence/AAI,
                Information Technology,
                Cyber Security & Digital Forensics/CDF,
                Immersive Media & Game Development/IGD
                ) or no
                Text: "{combined_post_comments}"
                """
                response_text_overall = safe_generate_content(model, prompt_overall)
                parts_overall = response_text_overall.split(',')

                # Default values
                post_sentiment = 0
                post_emotion = "Neutral"
                post_category = "Uncategorized"
                post_iit_flag = "no"

                if len(parts_overall) >= 4:
                    try:
                        post_sentiment = int(parts_overall[0].strip())
                    except ValueError:
                         logging.warning(f"[{subreddit_name}] Failed to parse overall sentiment for post {post_id}. Response: {response_text_overall}")
                    post_emotion = parts_overall[1].strip() if parts_overall[1].strip() else "Neutral"
                    post_category = parts_overall[2].strip().lower() if parts_overall[2].strip() else "Uncategorized"
                    post_iit_flag = parts_overall[3].strip().lower() if parts_overall[3].strip().lower() in ["yes", "no"] else "no"
                else:
                    logging.warning(f"[{subreddit_name}] Unexpected Gemini response format for overall post {post_id}. Response: {response_text_overall}")

                # --- Gemini Summary ---
                prompt_summary = f"""
                Create a 3-paragraph summary of the Reddit post and comments.
                1.  Summarize key topics/themes.
                2.  Describe overall sentiment/emotion, mentioning specific subjects, facilities, or campus life aspects if relevant.
                3.  (If applicable) Highlight concerns or suggestions for authorities, referencing specifics.
                If the text is too short or lacks meaning, state: "The text does not contain enough meaningful information to generate a summary, sentiment analysis, or recommendations."
                Do not use headings.
                Text: "{combined_post_comments}"
                """
                summary = safe_generate_content(model, prompt_summary)


                # --- Final Calculations for Post ---
                weighted_sentiment_score = weighted_sentiment_sum / total_weight if total_weight > 0 else 0
                engagement_score = (submission.score + 1) * math.log2(total_comments_agg + 1) # Use aggregated count
                related_to_tp = detect_temasek_poly_related(combined_post_comments)

                # --- Update In-Memory Aggregations for Post Author & Category ---
                update_author_stats_memory(author_updates, post_author, post_sentiment, is_post=True, post_id=post_id)
                update_category_stats_memory(category_updates, post_date_str, post_category, post_sentiment, post_id=post_id)


                # --- CONSOLIDATED Post Update ---
                post_update_data = {
                    "summary": summary,
                    "engagementScore": engagement_score,
                    "rawSentimentScore": raw_sentiment_score_agg, # Use aggregated value
                    "weightedSentimentScore": weighted_sentiment_score,
                    "sentiment": post_sentiment, # Overall sentiment from Gemini
                    "emotion": post_emotion,
                    "category": post_category,
                    "iit": post_iit_flag,
                    "relatedToTemasekPoly": related_to_tp,
                    "totalComments": total_comments_agg,
                    "totalPositiveSentiments": total_positive_sentiments_agg,
                    "totalNegativeSentiments": total_negative_sentiments_agg,
                    "lastUpdated": firestore.SERVER_TIMESTAMP # Track when updated
                }

                # Write the initial post doc and the update in one go if possible,
                # but usually safer to set first, then update.
                # Let's set the initial doc then update with aggregated/analyzed data.
                post_ref = refs["posts"].document(post_id)
                post_ref.set(post_doc, merge=True) # Use merge=True just in case it ran partially before
                post_ref.update(post_update_data) # Single update call!

                print(f"[{subreddit_name}] Successfully processed and updated post {post_id}.")
                updated_posts_count += 1

            except praw.exceptions.PRAWException as pe:
                 logging.error(f"[{subreddit_name}] PRAW error processing submission {submission.id}: {pe}")
                 print(f"[{subreddit_name}] PRAW Error on {submission.id}: {pe}")
            except Exception as e:
                logging.exception(f"[{subreddit_name}] Unexpected error processing submission {submission.id}: {e}") # Log full traceback
                print(f"[{subreddit_name}] Error on {submission.id}: {e}")
                # Continue to next submission
                continue

        # =====================================================
        # 2. Check for NEW Comments on OLD Posts (Hybrid Approach)
        # =====================================================
        print(f"\n[{subreddit_name}] Scanning recent comments for updates to older posts...")
        # Use a batch for writing these new comments
        new_comment_batch = db.batch()
        new_comment_write_count = 0
        # Track posts that need recalculation due to new comments
        posts_to_recalculate = defaultdict(list) # {post_id: [new_comment_data_dict]}

        try:
            # Limit might need adjustment based on comment frequency vs. run frequency
            for comment in sub.comments(limit=500):
                if not hasattr(comment, 'created_utc') or not hasattr(comment, 'id') or not hasattr(comment, 'submission'):
                    continue # Skip malformed

                comment_created_utc = comment.created_utc
                # Skip if comment is not new OR if its parent post was processed *in this run*
                # (avoids double processing comments added during the run)
                if comment_created_utc <= last_timestamp or comment.submission.created_utc > last_timestamp:
                    continue

                try:
                    post_id = comment.submission.id
                    comment_id = comment.id

                    # Check if comment *document* already exists (more robust than just timestamp)
                    comment_ref = refs["posts"].document(post_id).collection("comments").document(comment_id)
                    if comment_ref.get().exists:
                        # print(f"[{subreddit_name}] Skipping comment {comment_id} on old post {post_id} (already exists)")
                        continue # Already stored

                    # Check if parent post exists (it should if it's older)
                    post_ref = refs["posts"].document(post_id)
                    post_snapshot = post_ref.get()
                    if not post_snapshot.exists:
                         logging.warning(f"[{subreddit_name}] Skipping comment {comment_id} as parent post {post_id} not found.")
                         continue # Parent post not in DB, skip

                    print(f"[{subreddit_name}] Found NEW comment {comment_id} on OLD post {post_id}")

                    # --- Process the new comment (similar to above) ---
                    comment_author = str(comment.author) if comment.author else "[deleted]"
                    comment_body = comment.body
                    comment_score = comment.score
                    comment_created_dt = datetime.datetime.fromtimestamp(comment_created_utc)
                    comment_date_str = comment_created_dt.strftime("%Y-%m-%d")

                    prompt = f"""
                    Analyze the following Reddit comment.
                    Provide output as: <sentiment_score>,<emotion>,<category>,<iit_flag>
                    - sentiment_score: 1 (positive), -1 (negative), 0 (neutral)
                    - emotion: happy, relief, stress, frustration, pride, disappointment, confusion, neutral
                    - category: academic, exams, facilities, subjects, administration, career, admission, results, internship, lecturer, student life, infrastructure, classroom, events, CCA, other
                    - iit_flag: yes (related to School of IIT/Informatics & IT programs, including diplomas such as Big Data Analytics/BDA, 
                    Applied Artificial Intelligence/AAI,
                    Information Technology,
                    Cyber Security & Digital Forensics/CDF,
                    Immersive Media & Game Development/IGD
                    ) or no
                    Text: "{comment_body}"
                    """
                    response_text = safe_generate_content(model, prompt)
                    parts = response_text.split(',')
                    # Parse response with defaults (same logic as above)
                    sentiment = 0; emotion = "Neutral"; category = "Uncategorized"; iit_flag = "no"
                    if len(parts) >= 4:
                        try: sentiment = int(parts[0].strip())
                        except ValueError: pass
                        emotion = parts[1].strip() or "Neutral"
                        category = parts[2].strip().lower() or "Uncategorized"
                        iit_flag = parts[3].strip().lower() if parts[3].strip().lower() in ["yes", "no"] else "no"
                    else:
                         logging.warning(f"[{subreddit_name}] Unexpected Gemini format for new comment {comment_id} on old post {post_id}.")

                    comment_doc = {
                        "body": comment_body, "author": comment_author, "created": comment_created_dt,
                        "score": comment_score, "sentiment": sentiment, "emotion": emotion,
                        "category": category, "iit": iit_flag
                    }

                    # Add comment write to batch
                    new_comment_batch.set(comment_ref, comment_doc)
                    new_comment_write_count += 1
                    new_comments_on_old_posts_count += 1
                    processed_comments_count += 1 # Also count this as a processed comment

                    # Add data needed for recalculation later
                    posts_to_recalculate[post_id].append({
                        'sentiment': sentiment, 'score': comment_score
                    })


                    # --- Update In-Memory Aggregations ---
                    update_author_stats_memory(author_updates, comment_author, sentiment, is_post=False, post_id=post_id, comment_id=comment_id)
                    update_category_stats_memory(category_updates, comment_date_str, category, sentiment, post_id=post_id, comment_id=comment_id)

                    # Commit batch periodically
                    if new_comment_write_count >= BATCH_COMMIT_SIZE:
                        print(f"[{subreddit_name}] Committing intermediate new comment batch ({new_comment_write_count} ops)...")
                        try:
                            new_comment_batch.commit()
                            print(f"[{subreddit_name}] Intermediate new comment batch committed.")
                            new_comment_batch = db.batch()
                            new_comment_write_count = 0
                        except Exception as e:
                            logging.error(f"[{subreddit_name}] Error committing intermediate new comment batch: {e}")
                            new_comment_batch = db.batch() # Reset
                            new_comment_write_count = 0


                except praw.exceptions.PRAWException as pe:
                     logging.error(f"[{subreddit_name}] PRAW error processing comment {getattr(comment, 'id', 'N/A')} on old post: {pe}")
                except Exception as e:
                    logging.exception(f"[{subreddit_name}] Unexpected error processing comment {getattr(comment, 'id', 'N/A')} on old post: {e}")
                    continue # Continue with the next comment

            # Commit remaining new comments
            if new_comment_write_count > 0:
                print(f"[{subreddit_name}] Committing final new comment batch ({new_comment_write_count} ops)...")
                try:
                    new_comment_batch.commit()
                    print(f"[{subreddit_name}] Final new comment batch committed.")
                except Exception as e:
                    logging.error(f"[{subreddit_name}] Error committing final new comment batch: {e}")


            # =====================================================
            # 3. Recalculate Stats for Old Posts with New Comments
            # =====================================================
            if posts_to_recalculate:
                print(f"\n[{subreddit_name}] Recalculating stats for {len(posts_to_recalculate)} old posts with new comments...")
                recalc_batch = db.batch()
                recalc_ops_count = 0

                for post_id, _ in posts_to_recalculate.items(): # We only need post_id here
                    try:
                        post_ref = refs["posts"].document(post_id)
                        # Fetch ALL comments for the post *now* including the newly added ones
                        comments_snapshot = post_ref.collection("comments").stream()

                        # Recalculate aggregate scores
                        total_comments = 0
                        total_positive = 0
                        total_negative = 0
                        weighted_sum = 0.0
                        weight_total = 0.0
                        raw_sum = 0.0

                        for c_snap in comments_snapshot:
                            c_data = c_snap.to_dict()
                            sent = c_data.get("sentiment", 0)
                            score = c_data.get("score", 0)

                            weight = 1 + math.log2(max(score, 0) + 1)
                            weighted_sum += sent * weight
                            weight_total += weight
                            raw_sum += sent
                            total_comments += 1
                            if sent > 0:
                                total_positive += sent
                            elif sent < 0:
                                total_negative += sent

                        # Calculate final scores
                        weighted_sent = weighted_sum / weight_total if weight_total > 0 else 0

                        # Prepare update data for the post
                        post_recalc_update = {
                            'totalComments': total_comments,
                            'totalPositiveSentiments': total_positive,
                            'totalNegativeSentiments': total_negative,
                            'weightedSentimentScore': weighted_sent,
                            'rawSentimentScore': raw_sum, # Update raw score too
                            'lastUpdated': firestore.SERVER_TIMESTAMP
                        }

                        # Add update to batch
                        recalc_batch.update(post_ref, post_recalc_update)
                        recalc_ops_count += 1

                        # Commit batch periodically
                        if recalc_ops_count >= BATCH_COMMIT_SIZE:
                             print(f"[{subreddit_name}] Committing intermediate recalc batch ({recalc_ops_count} ops)...")
                             try:
                                 recalc_batch.commit()
                                 print(f"[{subreddit_name}] Intermediate recalc batch committed.")
                                 recalc_batch = db.batch()
                                 recalc_ops_count = 0
                             except Exception as e:
                                 logging.error(f"[{subreddit_name}] Error committing intermediate recalc batch: {e}")
                                 recalc_batch = db.batch() # Reset
                                 recalc_ops_count = 0

                    except Exception as e:
                        logging.error(f"[{subreddit_name}] Error recalculating stats for old post {post_id}: {e}")
                        continue # Skip to next post on error

                # Commit final recalc batch
                if recalc_ops_count > 0:
                    print(f"[{subreddit_name}] Committing final recalc batch ({recalc_ops_count} ops)...")
                    try:
                        recalc_batch.commit()
                        print(f"[{subreddit_name}] Final recalc batch committed.")
                    except Exception as e:
                        logging.error(f"[{subreddit_name}] Error committing final recalc batch: {e}")

        except praw.exceptions.PRAWException as pe:
            logging.error(f"[{subreddit_name}] PRAW error during recent comment scan: {pe}")
            print(f"[{subreddit_name}] PRAW Error during comment scan: {pe}")
        except Exception as e:
            logging.exception(f"[{subreddit_name}] Unexpected error during recent comment scan: {e}")
            print(f"[{subreddit_name}] Error during comment scan: {e}")


        # =============================================
        # 4. Commit Aggregated Stats (Authors & Categories)
        # =============================================
        print(f"\n[{subreddit_name}] Committing aggregated author and category stats...")
        commit_author_stats(author_updates, refs)
        # commit_category_stats(category_updates, refs)
        commit_category_stats_non_transactional(category_updates, refs)


        # =============================================
        # 5. Save the final timestamp
        # =============================================
        if new_last_timestamp > last_timestamp:
             set_last_timestamp(new_last_timestamp, subreddit_name, refs)
             print(f"[{subreddit_name}] Updated last timestamp to: {datetime.datetime.fromtimestamp(new_last_timestamp)} ({new_last_timestamp})")
        else:
             print(f"[{subreddit_name}] Last timestamp remains unchanged.")


        # --- Final Summary ---
        print(f"\n--- Finished crawl for r/{subreddit_name} ---")
        print(f"  New posts processed: {updated_posts_count}")
        print(f"  Total comments processed (new posts + new on old): {processed_comments_count}")
        print(f"  New comments found on old posts: {new_comments_on_old_posts_count}")

    except praw.exceptions.PRAWException as pe:
        logging.error(f"[{subreddit_name}] CRITICAL PRAW error during main crawl loop: {pe}")
        print(f"[{subreddit_name}] CRITICAL PRAW Error: {pe}")
    except Exception as e:
        logging.exception(f"[{subreddit_name}] CRITICAL unexpected error in main crawl function: {e}") # Log full traceback
        print(f"[{subreddit_name}] CRITICAL Error: {e}")


# ----------------------------
# Main - run for all subreddits
# ----------------------------
if __name__ == "__main__":
    start_time = time.time()
    print("Script started.")

    # Configure Google Gemini
    try:
        genai.configure(api_key=GOOGLE_GEMINI_API_KEY)
        # Optional: Adjust safety settings if needed, e.g.
        # safety_settings = [
        #     {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        #     {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        #     # ... other categories
        # ]
        # model = genai.GenerativeModel(safety_settings=safety_settings)
        model = genai.GenerativeModel() # Default settings
        print("Google Gemini Configured.")
    except Exception as e:
        logging.error(f"Failed to configure Google Gemini: {e}")
        print(f"CRITICAL: Failed to configure Google Gemini: {e}")
        exit()

    subreddits = load_subreddits()
    if not subreddits:
        print("No subreddits loaded. Exiting.")
        exit()

    for sb_name in subreddits:
        crawl_subreddit(sb_name, model)
        print("-" * 50) # Separator between subreddits

    end_time = time.time()
    print(f"\nScript finished in {end_time - start_time:.2f} seconds.")
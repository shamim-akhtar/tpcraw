import firebase_admin
from firebase_admin import credentials, firestore
import datetime
import logging
from collections import defaultdict # Use defaultdict for easier aggregation

# --- Constants ---
BATCH_COMMIT_SIZE = 400 # Max operations per batch is 500, use a lower number for safety

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s: %(message)s')

# Initialize Firebase Admin SDK
try:
    cred = credentials.Certificate("firebase-credentials.json")
    # Check if the app is already initialized to prevent errors on re-runs in some environments
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    else:
        # Get the default app if already initialized
        firebase_admin.get_app()
    db = firestore.client()
    logging.info("Firebase Initialized Successfully.")
except Exception as e:
    logging.error(f"Failed to initialize Firebase: {e}", exc_info=True)
    print(f"CRITICAL: Failed to initialize Firebase: {e}")
    exit()


# Dictionary to hold aggregation data using defaultdict for cleaner initialization:
# { "YYYY-MM-DD": { "category_lower": { "totalSentiment": ..., "count": ..., ... } } }
agg_data = defaultdict(lambda: defaultdict(lambda: {
    "totalSentiment": 0,
    "count": 0,
    "positiveCount": 0,
    "negativeCount": 0,
    "postIds": set(), # Use sets for efficient unique storage
    "comments": defaultdict(set) # Use {postId: set(commentIds)}
}))

def normalize_category(category):
    """Normalizes category names for consistent aggregation."""
    if not category or not isinstance(category, str):
        return "uncategorized"
    category_lower = category.strip().lower()
    return category_lower if category_lower else "uncategorized"

def parse_date(created_timestamp):
    """Safely parses Firestore Timestamp or Python datetime into YYYY-MM-DD string."""
    if hasattr(created_timestamp, "to_datetime"): # Handle Firestore Timestamp
        dt = created_timestamp.to_datetime()
    elif isinstance(created_timestamp, datetime.datetime): # Handle Python datetime
        dt = created_timestamp
    else:
        logging.warning(f"Could not parse date object: {created_timestamp} (type: {type(created_timestamp)})")
        return None # Indicate failure to parse

    # Ensure dt is timezone-naive UTC for consistent formatting, or handle timezone conversion if needed
    # For simplicity, assuming timestamps are stored consistently (e.g., UTC)
    return dt.strftime("%Y-%m-%d")


def update_agg_memory(date_str, category, sentiment, post_id=None, comment_id=None):
    """Update the in-memory aggregation dictionary."""
    # Get the specific daily aggregation, which gets the specific category aggregation
    agg_entry = agg_data[date_str][category] # defaultdict handles creation

    # Ensure sentiment is a number (handle None or potential strings if data is messy)
    try:
        sentiment_val = int(sentiment) if sentiment is not None else 0
    except (ValueError, TypeError):
        logging.warning(f"Invalid sentiment value '{sentiment}' for category '{category}' on {date_str}. Treating as 0.")
        sentiment_val = 0

    agg_entry["totalSentiment"] += sentiment_val
    agg_entry["count"] += 1

    if sentiment_val > 0:
        agg_entry["positiveCount"] += 1
    elif sentiment_val < 0:
        agg_entry["negativeCount"] += 1

    # Use sets to store unique IDs
    if post_id:
        agg_entry["postIds"].add(post_id)
        if comment_id:
            agg_entry["comments"][post_id].add(comment_id)


def process_data_combined():
    """
    Process all posts and their comments in a single pass to populate agg_data.
    Minimizes Firestore reads.
    """
    logging.info("Starting combined data processing...")
    posts_processed = 0
    comments_processed = 0
    posts_ref = db.collection("nus_posts") # Assuming 'posts' is the correct collection name

    try:
        # Iterate through all posts once
        for post in posts_ref.stream():
            post_id = post.id
            data = post.to_dict()

            # --- Process Post ---
            created = data.get("created")
            category = normalize_category(data.get("category")) # Normalize category name
            sentiment = data.get("sentiment") # Get sentiment (handle None in update_agg)

            date_str = parse_date(created)

            if date_str and category is not None and sentiment is not None:
                update_agg_memory(date_str, category, sentiment, post_id=post_id)
            else:
                 logging.warning(f"Skipping post {post_id} due to missing 'created', 'category', or 'sentiment'. Found: date={date_str}, category={category}, sentiment={sentiment}")

            # --- Process Comments for this Post ---
            try:
                comments_ref = posts_ref.document(post_id).collection("comments")
                for comment in comments_ref.stream():
                    comment_id = comment.id
                    comment_data = comment.to_dict()

                    comment_created = comment_data.get("created")
                    comment_category = normalize_category(comment_data.get("category")) # Normalize
                    comment_sentiment = comment_data.get("sentiment") # Get sentiment

                    comment_date_str = parse_date(comment_created)

                    if comment_date_str and comment_category is not None and comment_sentiment is not None:
                        update_agg_memory(comment_date_str, comment_category, comment_sentiment, post_id=post_id, comment_id=comment_id)
                        comments_processed += 1
                    else:
                        logging.warning(f"Skipping comment {comment_id} in post {post_id} due to missing 'created', 'category', or 'sentiment'. Found: date={comment_date_str}, category={comment_category}, sentiment={comment_sentiment}")

            except Exception as e_comment:
                logging.error(f"Error processing comments for post {post_id}: {e_comment}", exc_info=True)
                # Continue to the next post even if comments fail

            posts_processed += 1
            if posts_processed % 100 == 0:
                logging.info(f"Processed {posts_processed} posts...")

    except Exception as e_post:
        logging.error(f"Error streaming posts: {e_post}", exc_info=True)

    logging.info(f"Finished data processing. Processed {posts_processed} posts and {comments_processed} comments.")


def compute_averages_and_finalize_structure():
    """Compute averages and convert sets to lists for Firestore compatibility."""
    logging.info("Computing averages and finalizing data structure...")
    final_agg_data = {} # Create a new dict for the final structure
    for date_str, cat_dict in agg_data.items():
        final_cat_dict = {}
        for cat, stats in cat_dict.items():
            # Create a copy to modify for the final structure
            final_stats = stats.copy()
            # Calculate average
            if final_stats["count"] > 0:
                final_stats["averageSentiment"] = round(final_stats["totalSentiment"] / final_stats["count"], 5) # Round for neatness
            else:
                final_stats["averageSentiment"] = 0

            # Convert sets to sorted lists for Firestore
            final_stats["postIds"] = sorted(list(final_stats["postIds"]))
            final_comments_map = {}
            for post_id, comment_set in final_stats["comments"].items():
                final_comments_map[post_id] = sorted(list(comment_set))
            final_stats["comments"] = final_comments_map

            # Add the finalized stats for this category
            final_cat_dict[cat] = final_stats

        # Add the finalized dictionary for this date
        final_agg_data[date_str] = final_cat_dict

    logging.info("Finished computing averages and finalizing structure.")
    return final_agg_data # Return the data ready for Firestore


def save_to_firestore_batched(final_data):
    """Save the final aggregation results to Firestore using batches."""
    if not final_data:
        logging.warning("No aggregated data found to save.")
        return

    logging.info(f"Starting Firestore save for {len(final_data)} dates...")
    target_collection_ref = db.collection("nus_category_stats")
    batch = db.batch()
    count = 0

    # Iterate through the finalized data (dates are keys)
    for date_str, cat_dict_data in final_data.items():
        try:
            doc_ref = target_collection_ref.document(date_str)
            batch.set(doc_ref, cat_dict_data) # Use set to overwrite existing daily doc
            count += 1

            # Commit batch periodically
            if count >= BATCH_COMMIT_SIZE:
                logging.info(f"Committing batch of {count} date documents...")
                batch.commit()
                logging.info("Batch committed.")
                # Start a new batch
                batch = db.batch()
                count = 0
        except Exception as e:
            logging.error(f"Error adding document for date {date_str} to batch: {e}", exc_info=True)
            # Optionally skip this doc or handle error differently
            # Reset batch and count if a specific doc fails? Maybe better to log and continue adding others.

    # Commit any remaining operations in the last batch
    if count > 0:
        try:
            logging.info(f"Committing final batch of {count} date documents...")
            batch.commit()
            logging.info("Final batch committed.")
        except Exception as e:
            logging.error(f"Error committing final batch: {e}", exc_info=True)

    logging.info("Firestore save process completed.")


if __name__ == "__main__":
    logging.info("Starting ONE-TIME category sentiment aggregation script")
    start_time = datetime.datetime.now()

    # 1. Process posts and their comments in one pass, aggregating into memory
    process_data_combined()

    # 2. Calculate averages and convert data structure (sets to lists)
    final_data_to_save = compute_averages_and_finalize_structure()

    # 3. Save the final results to Firestore using batches
    save_to_firestore_batched(final_data_to_save)

    end_time = datetime.datetime.now()
    logging.info(f"Category sentiment aggregation completed in {end_time - start_time}")
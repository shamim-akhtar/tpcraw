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

"""
README - Reddit Crawler & Sentiment Aggregator for r/TemasekPoly

Overview:
---------
This Python script crawls recent posts and comments from the Reddit subreddit r/TemasekPoly
and saves them into a Firebase Firestore database. It uses Google's Gemini API (Generative AI)
to evaluate the sentiment, emotion, category, and IIT relevance of each post and its comments.

It is intended to be run automatically on a schedule (e.g. via cron or Task Scheduler) and includes
resilience features like error handling, automatic retries, and crash recovery.

Key Features:
-------------
- Crawls up to 500 of the most recent Reddit posts.
- Skips posts already crawled based on their creation timestamp.
- Processes and stores:
  - Post title, author, body, score, timestamp, URL
  - All associated comments
  - AI-generated sentiment score (raw and weighted), emotion, category, IIT relevance
  - A human-readable summary of the post and comment discussion
- Automatically calculates and stores engagement metrics (e.g. sentiment scores, comment counts).
- Tracks the last successfully crawled post to resume from where it left off.
- Writes error logs to a file (`crawler_errors.log`) for admin review.
- Handles Gemini API errors gracefully and retries calls automatically.

Requirements:
-------------
- Python 3.7+
- Firebase Admin SDK credentials saved in `firebase-credentials.json`
- Environment variables set via `.env`:
    - REDDIT_CLIENT_ID
    - REDDIT_CLIENT_SECRET
    - REDDIT_USER_AGENT
    - GOOGLE_GEMINI_API_KEY

Setup Instructions:
-------------------
1. Install dependencies:
   pip install praw firebase-admin google-generativeai python-dotenv

2. Add your `.env` file with Reddit and Gemini API credentials.

3. Run the script manually or schedule it to run automatically:
   python reddit_crawler.py

Firestore Structure:
--------------------
posts (collection)
 └─ {post_id} (document)
     ├─ title
     ├─ author
     ├─ body
     ├─ summary (AI-generated)
     ├─ engagementScore
     ├─ rawSentimentScore
     ├─ weightedSentimentScore
     ├─ emotion
     ├─ category
     ├─ iit (yes/no)
     ├─ totalComments
     ├─ totalPositiveSentiments
     ├─ totalNegativeSentiments
     └─ comments (subcollection)
          └─ {comment_id} (document)
               ├─ body
               ├─ author
               ├─ score
               ├─ sentiment
               ├─ emotion
               ├─ category
               └─ iit

Outputs:
--------
- New posts and comments saved to Firestore.
- AI summaries and sentiment metadata attached to each post.
- `last_timestamp.txt` updated with the latest processed timestamp.
- Logs stored in `crawler_errors.log`.
- A final printout showing the number of new posts updated.

"""


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

# # Specify the subreddit
# subreddit = reddit.subreddit('TemasekPoly')


# Initialize Firebase Firestore
cred = credentials.Certificate("firebase-credentials.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Load subreddit list from configuration file
def load_subreddits(file_path='subreddits.txt'):
    try:
        with open(file_path, 'r') as file:
            subreddits = [line.strip().lower() for line in file if line.strip()]
        return subreddits
    except Exception as e:
        logging.error(f"Failed to load subreddits from {file_path}: {e}")
        return []

# def detect_temasek_poly_related(text):
#     keywords = ['Temasek Polytechnic', 'TemasekPoly', 'TP', 'Temasek Poly']
#     text_lower = text.lower()
#     return any(keyword.lower() in text_lower for keyword in keywords)

import re

def detect_temasek_poly_related(text: str) -> bool:
    """
    Returns True if the text mentions Temasek Polytechnic in some form.
    Uses regex word boundaries (\b) so that 'TP' is matched only as
    a standalone word, rather than a substring of, say, "watpad."
    """
    if not text:
        return False
    
    # Regex pattern with word boundaries for each variant
    # The \b ensures we match "TP" as a separate token/word.
    # It also matches "Temasek Poly" or "Temasek Polytechnic" as complete words/phrases.
    # Using re.IGNORECASE for case-insensitive matching.
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

    # try:
    #     doc = db.collection("meta").document("last_timestamp").get()
    #     if doc.exists:
    #         return doc.to_dict().get("value", 0)
    # except Exception as e:
    #     logging.error(f"Error fetching last_timestamp from Firestore: {e}")
    # return 0

def get_collections(subreddit_name: str):
    """
    Returns a dictionary of Firestore collection references for posts, authors, 
    and category_stats, depending on whether the subreddit is 'TemasekPoly' or something else.
    """
    # Convert the subreddit name to lowercase to keep things consistent
    sub_lower = subreddit_name.lower()

    if sub_lower == "temasekpoly":
        # For TemasekPoly, keep your existing root-level collections:
        return {
            "posts": db.collection("posts"),
            "authors": db.collection("authors"),
            "category_stats": db.collection("category_stats"),
        }
    else:
        # e.g. "singapore_posts", "singapore_authors"
        return {
            'posts': db.collection(f"{sub_lower}_posts"),
            'authors': db.collection(f"{sub_lower}_authors"),
            'category_stats': db.collection(f"{sub_lower}_category_stats"),
        }


def set_last_timestamp(timestamp, subreddit):
    """Store the last crawled timestamp for a given subreddit in Firestore."""
    doc_id = f"last_timestamp_{subreddit}"
    try:
        db.collection("meta").document(doc_id).set({"value": timestamp})
    except Exception as e:
        logging.error(f"[{subreddit}] Error saving last_timestamp: {e}")

    # try:
    #     db.collection("meta").document("last_timestamp").set({"value": timestamp})
    # except Exception as e:
    #     logging.error(f"Error saving last_timestamp to Firestore: {e}")

# ADDED: Helper function to safely generate content with retries
def safe_generate_content(model, prompt, retries=3, delay=5):
    for attempt in range(retries):
        try:
            response = model.generate_content(prompt)
            # Check if the response is valid
            if response and response.text:
                return response.text.strip()
            else:
                raise ValueError("Empty response text")
        except Exception as e:
            logging.error(f"Error in generate_content: {e}. Attempt {attempt+1} of {retries}")
            time.sleep(delay)
    # Return a fallback message if all retries fail
    return "The text does not contain enough meaningful information to generate a summary, sentiment analysis, or recommendations."

# UPDATED: Helper function to update author stats in Firestore with post and comment IDs.
def update_author_stats(author, sentiment, subreddit, is_post=True, post_id=None, comment_id=None):
    """
    Updates the author's statistics in Firestore. Tracks:
      - totalSentimentScore
      - positiveCount
      - negativeCount
      - postCount
      - commentCount
      - averageSentiment
      - references to the posts and/or comments authored
    """
    try:
        # Access your Firestore collections for the given subreddit
        refs = get_collections(subreddit)
        author_ref = refs["authors"].document(author)
        author_doc = author_ref.get()

        # If the author doesn't exist, create a default stats structure
        if not author_doc.exists():
            author_stats = {
                "totalSentimentScore": 0,
                "postCount": 0,
                "commentCount": 0,
                "negativeCount": 0,
                "positiveCount": 0,
                "averageSentiment": 0,
                "posts": [],
                "comments": {}
            }
        else:
            # Load existing stats
            author_stats = author_doc.to_dict()
            # Ensure expected fields exist
            if "posts" not in author_stats:
                author_stats["posts"] = []
            if "comments" not in author_stats:
                author_stats["comments"] = {}
            if "positiveCount" not in author_stats:
                author_stats["positiveCount"] = 0
            if "negativeCount" not in author_stats:
                author_stats["negativeCount"] = 0

        # Update total sentiment score
        author_stats["totalSentimentScore"] += sentiment

        # Increment positive/negative counts if needed
        if sentiment > 0:
            author_stats["positiveCount"] = author_stats.get("positiveCount", 0) + 1
        elif sentiment < 0:
            author_stats["negativeCount"] = author_stats.get("negativeCount", 0) + 1

        # Update postCount or commentCount
        if is_post:
            author_stats["postCount"] += 1
            # Add the post ID to the author's posts list (if not already there)
            if post_id and post_id not in author_stats["posts"]:
                author_stats["posts"].append(post_id)
        else:
            author_stats["commentCount"] += 1
            # Add the comment under author_stats["comments"][postId]
            if post_id and comment_id:
                if post_id not in author_stats["comments"]:
                    author_stats["comments"][post_id] = []
                if comment_id not in author_stats["comments"][post_id]:
                    author_stats["comments"][post_id].append(comment_id)

        # Recompute average sentiment across all posts/comments
        total_interactions = author_stats["postCount"] + author_stats["commentCount"]
        if total_interactions > 0:
            author_stats["averageSentiment"] = author_stats["totalSentimentScore"] / total_interactions
        else:
            author_stats["averageSentiment"] = 0

        # Finally, write the updated stats back to Firestore
        author_ref.set(author_stats)

    except Exception as e:
        logging.error(f"Error updating author stats for {author}: {e}")



# Incremental update function for category_stats.
# This function updates the document for a given date and category,
# merging new sentiment values and updating lists of post IDs and comments.
def update_category_stats_incremental(date_str, category, sentiment, subreddit, post_id=None, comment_id=None):
    refs = get_collections(subreddit)
    doc_ref = refs["category_stats"].document(date_str)
    transaction = db.transaction()

    @firestore.transactional
    def update_in_transaction(transaction, doc_ref):
        snapshot = doc_ref.get(transaction=transaction)
        if snapshot.exists:
            data = snapshot.to_dict()
        else:
            data = {}
        if category not in data:
            data[category] = {
                "totalSentiment": 0,
                "count": 0,
                "positiveCount": 0,
                "negativeCount": 0,
                "postIds": [],
                "comments": {}  # Dictionary mapping post IDs to lists of comment IDs
            }
        cat_data = data[category]
        cat_data["totalSentiment"] += sentiment
        cat_data["count"] += 1
        if sentiment > 0:
            cat_data["positiveCount"] += 1
        elif sentiment < 0:
            cat_data["negativeCount"] += 1
        if post_id:
            if post_id not in cat_data["postIds"]:
                cat_data["postIds"].append(post_id)
        if comment_id and post_id:
            if post_id not in cat_data["comments"]:
                cat_data["comments"][post_id] = []
            if comment_id not in cat_data["comments"][post_id]:
                cat_data["comments"][post_id].append(comment_id)
        # Update the average sentiment
        cat_data["averageSentiment"] = cat_data["totalSentiment"] / cat_data["count"]
        data[category] = cat_data
        transaction.set(doc_ref, data)

    update_in_transaction(transaction, doc_ref)

def process_posts(subreddit):
    """Process all new posts in Firestore and update category_stats incrementally."""
    
    refs = get_collections(subreddit)
    posts = refs["posts"].stream()
    for post in posts:
        data = post.to_dict()
        if "created" in data and "category" in data and "sentiment" in data:
            created = data["created"]
            if hasattr(created, "to_datetime"):
                dt = created.to_datetime()
            elif isinstance(created, datetime.datetime):
                dt = created
            else:
                continue
            date_str = dt.strftime("%Y-%m-%d")
            category = data["category"]
            sentiment = data["sentiment"]
            post_id = post.id
            # Update category_stats incrementally with the post's sentiment and ID.
            update_category_stats_incremental(date_str, category, subreddit, sentiment, post_id=post_id)

def process_comments(subreddit):
    """Process new comments from all posts and update category_stats incrementally."""
    refs = get_collections(subreddit)

    posts = refs["posts"].stream()
    for post in posts:
        post_id = post.id
        comments =refs["posts"].document(post_id).collection("comments").stream()
        for comment in comments:
            data = comment.to_dict()
            if "created" in data and "category" in data and "sentiment" in data:
                created = data["created"]
                if hasattr(created, "to_datetime"):
                    dt = created.to_datetime()
                elif isinstance(created, datetime.datetime):
                    dt = created
                else:
                    continue
                date_str = dt.strftime("%Y-%m-%d")
                category = data["category"]
                sentiment = data["sentiment"]
                comment_id = comment.id
                # Update category_stats incrementally with the comment's sentiment,
                # and record the comment ID under its parent post.
                update_category_stats_incremental(date_str, category, sentiment, subreddit, post_id=post_id, comment_id=comment_id)

def crawl_subreddit(subreddit, model):
    # Get the last timestamp
    last_timestamp = get_last_timestamp(subreddit)
    new_last_timestamp = last_timestamp
    
    # Get correct Firestore references
    refs = get_collections(subreddit)
    sub = reddit.subreddit(subreddit)

    # ADDED: Counter for the number of new posts updated
    updated_posts_count = 0

    # ADDED: Wrap the entire crawling process to catch unexpected errors
    try:
        # Crawl new posts and comments incrementally
        for submission in sub.new(limit=500):  # Using 'new' to get recent posts
            # Skip posts that have already been processed
            if submission.created_utc <= last_timestamp:
                continue

            try:
                print(f"[{subreddit}] Found new post: {submission.id} : {submission.title}")

                # Update the latest timestamp
                if submission.created_utc > new_last_timestamp:
                    new_last_timestamp = submission.created_utc

                # Crawl comments
                submission.comments.replace_more(limit=None)
                comments = submission.comments.list()

                # Calculate scores and initialize sentiment data.
                raw_sentiment_score = 0.0
                categories = []  # e.g., ["Exams", "Facilities"]
                emotion = "Neutral"

                # Get the engagement score.
                upvotes = submission.score
                comments_count = submission.num_comments
                engagement_score = (upvotes + 1) * math.log2(comments_count + 1)

                combined_post_comments = ""
                combined_post_comments += submission.selftext

                # ------ SAVE TO Firebase database ----------------
                post_doc = {
                    "subreddit": subreddit,
                    "title": submission.title,
                    "author": str(submission.author),
                    "created": datetime.datetime.fromtimestamp(submission.created_utc),
                    "body": submission.selftext,
                    'summary': "",
                    "score": submission.score,
                    "URL": submission.url,
                    "engagementScore": engagement_score,
                    "rawSentimentScore": raw_sentiment_score,
                    "weightedSentimentScore": 0,
                    "categories": categories,
                    "emotion": emotion,
                }
                # Write the post document to Firestore: posts/{post_id}
                post_ref = refs["posts"].document(submission.id)
                post_ref.set(post_doc)

                weighted_sentiment_sum = 0.0
                total_weight = 0.0
                raw_sentiment_score = 0.0
                total_comments = 0
                total_positive_sentiments = 0
                total_negative_sentiments = 0

                # Process each comment with error handling
                for comment in comments:
                    combined_post_comments += f"\n{comment.body}"
                    prompt = f"""
                    You are an AI assigned to evaluate a Reddit post comment about 
                    Temasek Polytechnic. Review the following text and provide a concise output in this format: 
                    a sentiment score (1 for positive, -1 for negative, or 0 for neutral), 
                    then a comma, the identified emotion (happy, relief, stress, frustration, 
                    pride, disappointment, confusion, neutral), another comma, the determined category 
                    (academic, exams, facilities, subjects, administration, career, admission, results, internship,
                    lecturer, student life, infrastructure, classroom, events, CCA), 
                    and finally, a comma followed by "yes" or "no" indicating whether the text 
                    relates to the School of IIT (or the School of Informatics & IT, which includes
                    programs like Big Data Analytics, Applied AI, IT, Cybersecurity & Digital Forensics, 
                    Immersive Media & Game Development and Common ICT).
                    Text: "{comment.body}"
                    """
                    # ADDED: Use safe_generate_content to retry Gemini API calls
                    response_text = safe_generate_content(model, prompt)
                    # Expected format: "<sentiment>,<emotion>,<category>,<iit_flag>"
                    parts = response_text.split(',')

                    if len(parts) < 4:
                        logging.error(f"Unexpected response format for comment {comment.id}: {response_text}")
                        continue
                    else:
                        try:
                            sentiment = int(parts[0].strip())
                        except Exception as e:
                            logging.error(f"[{subreddit}] Error parsing sentiment for comment {comment.id}: {e}")
                            sentiment = 0
                        emotion = parts[1].strip()
                        category = parts[2].strip()
                        iit_flag = parts[3].strip()  # Expected to be "yes" or "no"

                    # Compute weight for the comment based on its score
                    weight = 1 + math.log2(max(comment.score, 0) + 1)
                    weighted_sentiment_sum += sentiment * weight
                    total_weight += weight
                    raw_sentiment_score += sentiment
                    total_comments += 1

                    if sentiment > 0:
                        total_positive_sentiments += sentiment
                    elif sentiment < 0:
                        total_negative_sentiments += sentiment

                    comment_doc = {
                        "body": comment.body,
                        "author": str(comment.author),
                        "created": datetime.datetime.fromtimestamp(comment.created_utc) if hasattr(comment, 'created_utc') else None,
                        "score": comment.score,
                        "sentiment": sentiment,
                        'emotion': emotion,
                        'category': category,
                        'iit': iit_flag,
                    }
                    # Write each comment into the subcollection: posts/{post_id}/comments/{comment_id}
                    post_ref.collection("comments").document(comment.id).set(comment_doc)

                    # Update the author's stats
                    update_author_stats(str(comment.author), sentiment, subreddit, is_post=False, post_id=submission.id, comment_id=comment.id)
                    # For each comment processed:
                    # Incrementally update category_stats for the comment.
                    comment_date_str = datetime.datetime.fromtimestamp(comment.created_utc).strftime("%Y-%m-%d")
                    update_category_stats_incremental(comment_date_str, category, sentiment, subreddit, post_id=submission.id, comment_id=comment.id)



                # Process overall post sentiment and summary using Gemini API with retries
                prompt = f"""
                You are an AI assigned to evaluate a Reddit post and its accompanying comments about 
                Temasek Polytechnic. Review the following text and provide a concise output in this format: 
                a sentiment score (1 for positive, -1 for negative, or 0 for neutral), 
                then a comma, the identified emotion (happy, relief, stress, frustration, 
                pride, disappointment, confusion, neutral), another comma, the determined category 
                (academic, exams, facilities, subjects, administration, career, admission, results, internship,
                lecturer, student life, infrastructure, classroom, events, CCA), 
                and finally, another comma followed by "yes" or "no" indicating whether the text 
                relates to the School of IIT (or the School of Informatics & IT, which includes
                programs like Big Data Analytics (BDA), Applied AI (AAI), IT (ITO), Cybersecurity & Digital Forensics (CDF), 
                Immersive Media & Game Development (IGD) and Common ICT (CIT).
                Text: "{combined_post_comments}"
                """
                response_text = safe_generate_content(model, prompt)
                parts = response_text.split(',')
                if len(parts) < 5:
                    logging.error(f"Unexpected response format for post {submission.id}: {response_text}")
                else:
                    try:
                        sentiment = int(parts[0].strip())
                    except Exception as e:
                        logging.error(f"[{subreddit}] Error parsing sentiment for post {submission.id}: {e}")
                        sentiment = 0
                    emotion = parts[1].strip()
                    category = parts[2].strip()
                    iit_flag = parts[3].strip()  # Expected to be "yes" or "no"

                prompt_summary = f"""
                You are an AI tasked with analyzing a Reddit post and its accompanying comments about 
                Temasek Polytechnic. Perform the following steps (do not provide headings or titles for any paragraphs):

                1. Start with a concise paragraph summarizing the key topics, issues, 
                or themes discussed across the post and comments.

                2. In the second paragraph, describe the overall sentiment and emotional 
                tone expressed. Mention any references to specific academic subjects, school facilities, 
                or aspects of campus life, if applicable.

                3. If appropriate, include a third paragraph highlighting any 
                concerns raised or constructive suggestions for school authorities. Clearly reference 
                any specific subjects, facilities, or experiences mentioned.

                If the provided text lacks sufficient content for analysis (e.g., it only contains links, 
                attachments, or unrelated filler), simply state:

                “The text does not contain enough meaningful information to generate a summary, sentiment analysis, or recommendations.”

                Text: "{combined_post_comments}"
                """
                summary = safe_generate_content(model, prompt_summary)

                #related to tp.
                
                post_text = submission.title + " " + submission.selftext
                related_to_tp = detect_temasek_poly_related(combined_post_comments)

                # Calculate the weighted sentiment score for the post
                weighted_sentiment_score = weighted_sentiment_sum / total_weight if total_weight > 0 else 0
                # Update the post document.
                post_ref.update({"weightedSentimentScore": weighted_sentiment_score})
                post_ref.update({"rawSentimentScore": raw_sentiment_score})
                post_ref.update({"summary": summary})
                post_ref.update({"sentiment": sentiment})
                post_ref.update({"emotion": emotion})
                post_ref.update({"category": category})
                post_ref.update({"iit": iit_flag})
                post_ref.update({"relatedToTemasekPoly": related_to_tp})
                # Update aggregated comment info
                post_ref.update({
                    'totalComments': total_comments,
                    'totalPositiveSentiments': total_positive_sentiments,
                    'totalNegativeSentiments': total_negative_sentiments
                })
                print(f"weightedSentimentScore: {weighted_sentiment_score}, rawSentimentScore: {raw_sentiment_score}")

                # Update the author's stats
                update_author_stats(str(submission.author), sentiment, subreddit, is_post=True, post_id=submission.id)

                post_date_str = datetime.datetime.fromtimestamp(submission.created_utc).strftime("%Y-%m-%d")
                update_category_stats_incremental(post_date_str, category, sentiment, subreddit, post_id=submission.id)



                # ADDED: Increment the counter after successfully processing this post
                updated_posts_count += 1

            except Exception as e:
                # ADDED: Log any errors during processing of a submission and continue with next post
                logging.error(f"[{subreddit}] Error processing submission {submission.id}: {e}")
                continue

        # Save the new last timestamp for the next run
        set_last_timestamp(new_last_timestamp, subreddit)

        # ADDED: Print out the number of new posts updated
        print(f"Number of new posts updated: {updated_posts_count}")

        # HYBRID ADDITION: Track new comments on older posts
        print("Scanning recent comments for updates to older posts...")
        for comment in sub.comments(limit=500):
            try:
                # Ignore comments already processed
                comment_ref = refs["posts"].document(comment.submission.id).collection("comments").document(comment.id)
                if comment_ref.get().exists:
                    continue  # Already stored

                comment_created = datetime.datetime.fromtimestamp(comment.created_utc)
                if comment.created_utc <= last_timestamp:
                    continue  # Already seen

                # Fetch parent post info
                post_id = comment.submission.id
                post_ref = refs["posts"].document(post_id)
                post_snapshot = post_ref.get()

                if not post_snapshot.exists:
                    continue  # Parent post was never processed (skip)

                print(f"New comment on old post {post_id}: {comment.id}")

                # Run Gemini prompt for single comment
                prompt = f'''
                You are an AI assigned to evaluate a Reddit post comment about 
                Temasek Polytechnic. Review the following text and provide a concise output in this format: 
                a sentiment score (1 for positive, -1 for negative, or 0 for neutral), 
                then a comma, the identified emotion (happy, relief, stress, frustration, 
                pride, disappointment, confusion, neutral), another comma, the determined category 
                (academic, exams, facilities, subjects, administration, career, admission, results, internship,
                lecturer, student life, infrastructure, classroom, events, CCA), 
                and finally, a comma followed by "yes" or "no" indicating whether the text 
                relates to the School of IIT (or the School of Informatics & IT, which includes
                programs like Big Data Analytics, Applied AI, IT, Cybersecurity & Digital Forensics, 
                Immersive Media & Game Development and Common ICT).
                Text: "{comment.body}"
                '''
                response_text = safe_generate_content(model, prompt)
                parts = response_text.split(',')

                if len(parts) < 4:
                    logging.error(f"[OLD POST] Unexpected response format for comment {comment.id}: {response_text}")
                    continue

                sentiment = int(parts[0].strip())
                emotion = parts[1].strip()
                category = parts[2].strip()
                iit_flag = parts[3].strip()

                comment_doc = {
                    "body": comment.body,
                    "author": str(comment.author),
                    "created": comment_created,
                    "score": comment.score,
                    "sentiment": sentiment,
                    "emotion": emotion,
                    "category": category,
                    "iit": iit_flag,
                }
                comment_ref.set(comment_doc)

                # Fetch all comments for that post and recalculate sentiment metrics
                comments_ref = post_ref.collection("comments").stream()
                total_comments = 0
                total_positive = 0
                total_negative = 0
                weighted_sum = 0
                weight_total = 0

                for c in comments_ref:
                    d = c.to_dict()
                    score = d.get("score", 0)
                    sent = d.get("sentiment", 0)
                    weight = 1 + math.log2(max(score, 0) + 1)
                    weighted_sum += sent * weight
                    weight_total += weight
                    total_comments += 1
                    if sent > 0:
                        total_positive += sent
                    elif sent < 0:
                        total_negative += sent
                    
                    
                    # Update the author's stats
                    author_name = d.get("author", "Unknown")
                    update_author_stats(author_name, sent, subreddit, is_post=False, post_id=post_id, comment_id=c.id)

                    # Update category_stats incrementally for the new comment.
                    comment_date_str = datetime.datetime.fromtimestamp(comment.created_utc).strftime("%Y-%m-%d")
                    update_category_stats_incremental(comment_date_str, category, sentiment, subreddit, post_id=post_id, comment_id=comment.id)

                weighted_sent = weighted_sum / weight_total if weight_total > 0 else 0

                post_ref.update({
                    'totalComments': total_comments,
                    'totalPositiveSentiments': total_positive,
                    'totalNegativeSentiments': total_negative,
                    'weightedSentimentScore': weighted_sent
                })

            except Exception as e:
                logging.error(f"[{subreddit}] Error processing new comment on old post: {e}")
                continue


    except Exception as e:
        # ADDED: Log any critical errors that occur during the crawling process
        logging.error(f"Critical error in crawling process: {e}")

# ----------------------------
# Main - run for all subreddits
# ----------------------------
if __name__ == "__main__":
    # Configure Google Gemini
    genai.configure(api_key=GOOGLE_GEMINI_API_KEY)
    model = genai.GenerativeModel()

    # Load the subreddits from config
    subreddits = load_subreddits()

    # For each subreddit in the list, run the same logic
    for sb_name in subreddits:
        crawl_subreddit(sb_name, model)
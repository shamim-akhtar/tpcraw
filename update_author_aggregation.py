'''
1. Reads all posts and comments from Firestore.
2. Aggregates sentiment statistics per author.
3. Saves these aggregated results under a new authors collection in Firestore.

authors (collection)
 └─ {username} (document)
     ├─ totalSentimentScore (float)
     ├─ postCount (int)
     ├─ commentCount (int)
     ├─ negativeCount (int)
     ├─ positiveCount (int)
     ├─ averageSentiment (float)

'''
import os
import firebase_admin
from firebase_admin import credentials, firestore
import logging

# Setup logging to file
logging.basicConfig(filename='author_aggregation_errors.log', 
                    level=logging.ERROR,
                    format='%(asctime)s %(levelname)s: %(message)s')

# Initialize Firebase Firestore
cred = credentials.Certificate("firebase-credentials.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Author statistics dictionary
author_stats = {}

# Process posts
def process_posts():
    posts = db.collection("posts").stream()
    for post_doc in posts:
        post = post_doc.to_dict()
        author = post.get("author", "Unknown")
        sentiment = post.get("sentiment", 0)

        if author not in author_stats:
            author_stats[author] = {
                "totalSentimentScore": 0,
                "postCount": 0,
                "commentCount": 0,
                "negativeCount": 0,
                "positiveCount": 0
            }

        # Update stats for the post author
        author_stats[author]["totalSentimentScore"] += sentiment
        author_stats[author]["postCount"] += 1
        author_stats[author]["posts"].append(post_doc.id)
        
        if sentiment < 0:
            author_stats[author]["negativeCount"] += 1
        elif sentiment > 0:
            author_stats[author]["positiveCount"] += 1

# Process comments
def process_comments():
    posts = db.collection("posts").stream()
    for post_doc in posts:
        post_id = post_doc.id
        comments = db.collection("posts").document(post_id).collection("comments").stream()

        for comment_doc in comments:
            comment = comment_doc.to_dict()
            author = comment.get("author", "Unknown")
            sentiment = comment.get("sentiment", 0)

            if author not in author_stats:
                author_stats[author] = {
                    "totalSentimentScore": 0,
                    "postCount": 0,
                    "commentCount": 0,
                    "negativeCount": 0,
                    "positiveCount": 0
                }

            # Update stats for the comment author
            author_stats[author]["totalSentimentScore"] += sentiment
            author_stats[author]["commentCount"] += 1
            
            if sentiment < 0:
                author_stats[author]["negativeCount"] += 1
            elif sentiment > 0:
                author_stats[author]["positiveCount"] += 1
            
            # Associate comment IDs with the corresponding post
            if post_id not in author_stats[author]["comments"]:
                author_stats[author]["comments"][post_id] = []
            author_stats[author]["comments"][post_id].append(comment_doc.id)

# Save to Firestore
def save_to_firestore():
    for author, stats in author_stats.items():
        try:
            total_comments = stats.get("commentCount", 0)
            total_posts = stats.get("postCount", 0)
            total_interactions = total_comments + total_posts

            # Calculate average sentiment
            if total_interactions > 0:
                stats["averageSentiment"] = stats["totalSentimentScore"] / total_interactions
            else:
                stats["averageSentiment"] = 0

            # Save to Firestore
            db.collection("authors").document(author).set(stats)

            print(f"Saved stats for author: {author}")
        except Exception as e:
            logging.error(f"Error saving author stats for {author}: {e}")

if __name__ == "__main__":
    print("Starting author aggregation...")

    process_posts()
    process_comments()
    save_to_firestore()

    print("Author aggregation completed successfully!")

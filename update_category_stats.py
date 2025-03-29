'''
Python script that performs the one‐time aggregation of sentiment by category 
on a per-day basis. It scans all posts and their comments from Firestore, extracts 
each item’s creation date (converted to "YYYY-MM-DD"), category, and sentiment, and 
then builds an aggregation document for each day. The resulting document (with 
aggregated counts, totals, and average sentiment) is saved under the 
"category_stats" collection. 

category_stats (collection)
└── 2025-03-29 (document)
    ├── academic (map)
    │   ├── totalSentiment: -2
    │   ├── count: 5
    │   ├── positiveCount: 1
    │   ├── negativeCount: 3
    │   └── averageSentiment: -0.4
    ├── exams (map)
    │   ├── totalSentiment: -3
    │   ├── count: 4
    │   ├── positiveCount: 0
    │   ├── negativeCount: 3
    │   └── averageSentiment: -0.75
    └── internship (map)
        ├── totalSentiment: 1
        ├── count: 2
        ├── positiveCount: 1
        ├── negativeCount: 0
        └── averageSentiment: 0.5

'''

import firebase_admin
from firebase_admin import credentials, firestore
import datetime
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s: %(message)s')

# Initialize Firebase Admin SDK
cred = credentials.Certificate("firebase-credentials.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Dictionary to hold aggregation data:
# { "YYYY-MM-DD": { "exams": { "totalSentiment": ..., "count": ..., "positiveCount": ..., "negativeCount": ..., "averageSentiment": ... },
#                   "academic": { ... },
#                   ... } }
agg_data = {}

def update_agg(date_str, category, sentiment):
    """Update the aggregation dictionary for the given date and category."""
    if date_str not in agg_data:
        agg_data[date_str] = {}
    if category not in agg_data[date_str]:
        agg_data[date_str][category] = {
            "totalSentiment": 0,
            "count": 0,
            "positiveCount": 0,
            "negativeCount": 0
        }
    agg_entry = agg_data[date_str][category]
    agg_entry["totalSentiment"] += sentiment
    agg_entry["count"] += 1
    if sentiment > 0:
        agg_entry["positiveCount"] += 1
    elif sentiment < 0:
        agg_entry["negativeCount"] += 1

def process_posts():
    """Process all posts in Firestore and update the aggregation."""
    posts = db.collection("posts").stream()
    for post in posts:
        data = post.to_dict()
        # Ensure the required fields exist
        if "created" in data and "category" in data and "sentiment" in data:
            created = data["created"]
            # Convert Firestore Timestamp or datetime to Python datetime
            if hasattr(created, "to_datetime"):
                dt = created.to_datetime()
            elif isinstance(created, datetime.datetime):
                dt = created
            else:
                continue
            date_str = dt.strftime("%Y-%m-%d")
            category = data["category"]
            sentiment = data["sentiment"]
            update_agg(date_str, category, sentiment)

def process_comments():
    """Process all comments for each post and update the aggregation."""
    posts = db.collection("posts").stream()
    for post in posts:
        comments = db.collection("posts").document(post.id).collection("comments").stream()
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
                update_agg(date_str, category, sentiment)

def compute_averages():
    """For each date and category, compute the average sentiment."""
    for date_str, cat_dict in agg_data.items():
        for cat, stats in cat_dict.items():
            if stats["count"] > 0:
                stats["averageSentiment"] = stats["totalSentiment"] / stats["count"]
            else:
                stats["averageSentiment"] = 0

def save_to_firestore():
    """Save the aggregation results to Firestore under 'category_stats/{YYYY-MM-DD}'."""
    for date_str, cat_dict in agg_data.items():
        db.collection("category_stats").document(date_str).set(cat_dict)
        logging.info(f"Saved category stats for {date_str}")

if __name__ == "__main__":
    logging.info("Starting category sentiment aggregation script")
    process_posts()
    process_comments()
    compute_averages()
    save_to_firestore()
    logging.info("Category sentiment aggregation completed")

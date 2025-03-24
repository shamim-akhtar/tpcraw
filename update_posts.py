# FIRST set environment variables explicitly to disable gRPC and use REST transport
import os
import certifi

# os.environ['GOOGLE_CLOUD_DISABLE_GRPC'] = 'true'
# os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

# Now import certifi AFTER setting os.environ

import firebase_admin
from firebase_admin import credentials, firestore

# Set explicit certificates for REST transport
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

def init_firebase():
    cred = credentials.Certificate("firebase-credentials.json")
    firebase_admin.initialize_app(cred)
    return firestore.client()

def aggregate_comments(db):
    posts_ref = db.collection('posts')
    posts = posts_ref.stream()

    for post in posts:
        post_id = post.id
        comments_ref = posts_ref.document(post_id).collection('comments')
        comments = comments_ref.stream()

        total_comments = 0
        total_positive_sentiments = 0
        total_negative_sentiments = 0

        for comment in comments:
            comment_data = comment.to_dict()
            sentiment = comment_data.get('sentiment', 0)

            total_comments += 1

            if sentiment > 0:
                total_positive_sentiments += sentiment
            elif sentiment < 0:
                total_negative_sentiments += sentiment

        # Update the post with aggregated comment info
        posts_ref.document(post_id).update({
            'totalComments': total_comments,
            'totalPositiveSentiments': total_positive_sentiments,
            'totalNegativeSentiments': total_negative_sentiments
        })

        print(f"Post {post_id} updated: Comments={total_comments}, Positive={total_positive_sentiments}, Negative={total_negative_sentiments}")

def main():
    db = init_firebase()
    aggregate_comments(db)

if __name__ == "__main__":
    main()

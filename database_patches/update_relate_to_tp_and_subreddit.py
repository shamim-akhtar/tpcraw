import firebase_admin
from firebase_admin import credentials, firestore
import logging

# Logging configuration
logging.basicConfig(filename='firestore_update.log', level=logging.INFO)

def init_firebase():
    cred = credentials.Certificate("firebase-credentials.json")
    firebase_admin.initialize_app(cred)
    return firestore.client()

def update_posts(db):
    posts_ref = db.collection('posts')
    posts = posts_ref.stream()

    for post in posts:
        try:
            post_id = post.id
            
            posts_ref.document(post_id).update({
                'relatedToTemasekPoly': True,
                'subreddit': 'TemasekPoly',
            })
            
        except Exception as e:
            logging.error(f"Failed to update post {post.id}: {str(e)}")

def main():
    db = init_firebase()
    update_posts(db)
    print("Database update completed. Check 'firestore_update.log' for details.")

if __name__ == "__main__":
    main()
import firebase_admin 
from firebase_admin import credentials, firestore
import google.generativeai as genai
import os
import time

GOOGLE_GEMINI_API_KEY = os.getenv('GOOGLE_GEMINI_API_KEY')

# Utility functions to load/save the last processed post ID
def load_last_processed_id():
    try:
        with open("last_processed.txt", "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        return None

def save_last_processed_id(post_id):
    with open("last_processed.txt", "w") as f:
        f.write(post_id)

# A safe streaming function with retries in case of timeouts or transient errors
def safe_stream(query_or_ref, retries=3, delay=5):
    for attempt in range(retries):
        try:
            return list(query_or_ref.stream())
        except Exception as e:
            print(f"Error during query stream: {e}. Retrying {attempt+1}/{retries}...")
            time.sleep(delay)
    raise Exception("Exceeded maximum retries for query stream.")

"""
README - Reddit Sentiment Aggregator for Temasek Polytechnic
Ideally the crawler should execute the summarisation and insert to Firebase database.
However, this program can be used to patch or redo the entire collection of posts on demand.

This Python script connects to a Firestore database of Reddit posts and comments
(sourced from r/TemasekPoly) and uses the Google Gemini API to generate AI-driven
summaries based on post content and comment discussions.

Purpose:
---------
To assist in analyzing student feedback and sentiment about Temasek Polytechnic,
this script:
- Initializes Firebase Firestore using credentials in 'firebase-credentials.json'.
- Iterates through each Reddit post in the 'posts' collection.
- Fetches all comments associated with each post.
- Combines the post body and all comment bodies into a single text block.
- Sends this combined content to the Gemini model for summarization.
- Writes the AI-generated summary back to the Firestore 'posts' document under the 'summary' field.
- Logs the last processed post ID so that processing can resume if the app crashes.

Expected Usage:
---------------
- Ensure you have the `firebase_admin` and `google-generativeai` packages installed.
- Have your Firebase credentials in 'firebase-credentials.json'.
- Set the environment variable `GOOGLE_GEMINI_API_KEY` with your Gemini API key.
- Run the script with: `python this_script.py`

Dependencies:
-------------
- firebase_admin
- google-generativeai
- Firestore database structured as:
    posts (collection)
      |- {postId} (document)
          |- body: str
          |- comments (subcollection)
                |- {commentId} (document)
                    |- body: str

Outputs:
--------
Each post document is updated with a 'summary' field containing:
1. A summary of the main discussion.
2. Analysis of sentiment and tone.
3. (Optional) Recommendations or concerns if mentioned.
Additionally, the last processed post ID is logged to "last_processed.txt".
"""

def init_firebase():
    cred = credentials.Certificate("firebase-credentials.json")
    firebase_admin.initialize_app(cred)
    return firestore.client()

def aggregate_comments(db, last_post_id='None', batch_size=10):
    posts_ref = db.collection('posts')
    # Base query ordering by document ID
    query_base = posts_ref.order_by('__name__')

    # Configure Gemini API
    genai.configure(api_key=GOOGLE_GEMINI_API_KEY)
    model = genai.GenerativeModel() 

    while True:
        # Build query for the current batch of posts
        query = query_base.limit(batch_size)
        if last_post_id:
            last_doc_ref = posts_ref.document(last_post_id)
            last_doc_snapshot = last_doc_ref.get()
            query = query.start_after(last_doc_snapshot)
        
        try:
            posts = safe_stream(query)
        except Exception as e:
            print(f"Failed to retrieve a batch of posts: {e}")
            break
        
        if not posts:
            print("No more posts to process.")
            break

        for post in posts:
            post_id = post.id
            try:
                post_data = post.to_dict()
                
                # Combine post body with all its comment bodies
                combined_post_comments = post_data.get('body', '')
                comments_ref = posts_ref.document(post_id).collection('comments')
                comments = safe_stream(comments_ref)
                for comment in comments:
                    comment_data = comment.to_dict()
                    combined_post_comments += comment_data.get('body', '')
                
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
                response = model.generate_content(prompt_summary)

                # Check if the Gemini response contains valid content
                if not response.candidates or not response.candidates[0].content.parts:
                    print(f"Skipping post {post_id} due to invalid content or blocked generation.")
                    summary = ("The text does not contain enough meaningful information to generate a summary, "
                               "sentiment analysis, or recommendations.")
                else:
                    summary = response.text.strip()
                
                # Update the post with the generated summary
                posts_ref.document(post_id).update({
                    'summary': summary,
                })

                print(f"Post - {post_id}: {summary}\n-------------------------------------------------------------\n")
                # Log the last processed post ID so that processing can resume if needed
                save_last_processed_id(post_id)
                last_post_id = post_id  # Update the marker

            except Exception as e:
                print(f"Error processing post {post_id}: {e}")
                # Save the last processed post ID on error and then continue
                save_last_processed_id(post_id)
                continue

def main():
    db = init_firebase()
    last_post_id = load_last_processed_id()
    print(f"Resuming from last processed post: {last_post_id}")
    aggregate_comments(db, last_post_id=last_post_id)

if __name__ == "__main__":
    main()

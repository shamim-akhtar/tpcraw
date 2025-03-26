import firebase_admin
from firebase_admin import credentials, firestore
import google.generativeai as genai
import os

GOOGLE_GEMINI_API_KEY = os.getenv('GOOGLE_GEMINI_API_KEY')

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

Expected Usage:
---------------
- Make sure you have the `firebase_admin` and `google.generativeai` packages installed.
- Ensure your Firebase credentials are stored in a file named 'firebase-credentials.json'.
- Set the environment variable `GOOGLE_GEMINI_API_KEY` with your Gemini API key.
- Run the script with: `python this_script.py`

Dependencies:
-------------
- firebase_admin
- google-generativeai
- A Firestore database structure like:
    posts (collection)
      |- {postId} (document)
          |- body: str
          |- comments (subcollection)
                |- {commentId} (document)
                    |- body: str

Outputs:
--------
Each post document will be updated with a 'summary' field, containing:
1. A summary of the main discussion.
2. Analysis of sentiment and tone.
3. (Optional) Recommendations or concerns if mentioned.

This script is designed to work with a dashboard (HTML/JS/CSS) that visualizes
sentiment data and summaries.
"""


def init_firebase():
    cred = credentials.Certificate("firebase-credentials.json")
    firebase_admin.initialize_app(cred)
    return firestore.client()

def aggregate_comments(db):
    posts_ref = db.collection('posts')
    posts = posts_ref.stream()
    
    genai.configure(api_key=GOOGLE_GEMINI_API_KEY)
    model = genai.GenerativeModel() 

    for post in posts:
        post_id = post.id
        
        post_data = post.to_dict()
        
        combined_post_comments = ""
        combined_post_comments += post_data.get('body', '')

        comments_ref = posts_ref.document(post_id).collection('comments')
        comments = comments_ref.stream()

        for comment in comments:
            comment_data = comment.to_dict()
            combined_post_comments += comment_data.get('body','')
        
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

        # Ensure the response contains valid content
        if not response.candidates or not response.candidates[0].content.parts:
            print(f"Skipping post {post_id} due to invalid content or blocked generation.")
            summary = "The text does not contain enough meaningful information to generate a summary, sentiment analysis, or recommendations."
        else:
            summary = response.text.strip()

        
        summary = response.text.strip()

        # Update the post with aggregated comment info
        posts_ref.document(post_id).update({
            'summary': summary,
        })

        print(f"Post - {post_id}: {summary}\n-------------------------------------------------------------\n")

def main():
    db = init_firebase()
    aggregate_comments(db)

if __name__ == "__main__":
    main()

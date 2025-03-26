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

# Specify the subreddit
subreddit = reddit.subreddit('TemasekPoly')

# Initialize Firebase Firestore
cred = credentials.Certificate("firebase-credentials.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# File to store the last crawled timestamp
LAST_TIMESTAMP_FILE = 'last_timestamp.txt'

def get_last_timestamp():
    #Retrieve the last timestamp from file.
    if os.path.exists(LAST_TIMESTAMP_FILE):
        with open(LAST_TIMESTAMP_FILE, 'r') as f:
            return float(f.read().strip())
    return 0

def set_last_timestamp(timestamp):
    #Save the last timestamp to file.
    with open(LAST_TIMESTAMP_FILE, 'w') as f:
        f.write(str(timestamp))

def save_to_file(filename, content):
    #Save content to a text file.
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

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

# Get the last timestamp
last_timestamp = get_last_timestamp()
new_last_timestamp = last_timestamp

# Configure Gemini API
genai.configure(api_key=GOOGLE_GEMINI_API_KEY)
model = genai.GenerativeModel()  # Use 'gemini-pro-vision' for multimodal

# ADDED: Counter for the number of new posts updated
updated_posts_count = 0

# ADDED: Wrap the entire crawling process to catch unexpected errors
try:
    # Crawl new posts and comments incrementally
    for submission in subreddit.new(limit=500):  # Using 'new' to get recent posts
        # Skip posts that have already been processed
        if submission.created_utc <= last_timestamp:
            continue

        try:
            print(f"Found new post: {submission.id} : {submission.title}")

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
            post_ref = db.collection("posts").document(submission.id)
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
                        logging.error(f"Error parsing sentiment for comment {comment.id}: {e}")
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
                    logging.error(f"Error parsing sentiment for post {submission.id}: {e}")
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
            # Update aggregated comment info
            post_ref.update({
                'totalComments': total_comments,
                'totalPositiveSentiments': total_positive_sentiments,
                'totalNegativeSentiments': total_negative_sentiments
            })
            print(f"weightedSentimentScore: {weighted_sentiment_score}, rawSentimentScore: {raw_sentiment_score}")

            # ADDED: Increment the counter after successfully processing this post
            updated_posts_count += 1

        except Exception as e:
            # ADDED: Log any errors during processing of a submission and continue with next post
            logging.error(f"Error processing submission {submission.id}: {e}")
            continue

    # Save the new last timestamp for the next run
    set_last_timestamp(new_last_timestamp)

    # ADDED: Print out the number of new posts updated
    print(f"Number of new posts updated: {updated_posts_count}")

except Exception as e:
    # ADDED: Log any critical errors that occur during the crawling process
    logging.error(f"Critical error in crawling process: {e}")

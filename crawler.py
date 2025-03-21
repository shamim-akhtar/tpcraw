import math
import praw
import os
import datetime
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

import google.generativeai as genai

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

# Create a directory to save the data
output_dir = 'reddit_data'
os.makedirs(output_dir, exist_ok=True)

# Initialize Firebase Firestore
cred = credentials.Certificate("firebase-credentials.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# File to store the last crawled timestamp
LAST_TIMESTAMP_FILE = 'last_timestamp.txt'

def get_last_timestamp():
    """Retrieve the last timestamp from file."""
    if os.path.exists(LAST_TIMESTAMP_FILE):
        with open(LAST_TIMESTAMP_FILE, 'r') as f:
            return float(f.read().strip())
    return 0

def set_last_timestamp(timestamp):
    """Save the last timestamp to file."""
    with open(LAST_TIMESTAMP_FILE, 'w') as f:
        f.write(str(timestamp))

def save_to_file(filename, content):
    """Save content to a text file."""
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

# Get the last timestamp
last_timestamp = get_last_timestamp()
new_last_timestamp = last_timestamp

genai.configure(api_key=GOOGLE_GEMINI_API_KEY)
model = genai.GenerativeModel()  # Use 'gemini-pro-vision' for multimodal

# #temp
# # Given UTC date/time string
# utc_str = "2025-03-20 15:35:30"

# # Parse the string into a datetime object (assuming UTC)
# dt = datetime.datetime.strptime(utc_str, "%Y-%m-%d %H:%M:%S")

# # Set timezone to UTC
# dt_utc = dt.replace(tzinfo=datetime.timezone.utc)

# # Convert to Unix timestamp
# timestamp = dt_utc.timestamp()
# print("Timestamp:", timestamp)
# set_last_timestamp(timestamp)


# Crawl new posts and comments incrementally
for submission in subreddit.new(limit=500):  # Using 'new' to get recent posts
    if submission.created_utc <= last_timestamp:
        continue
    
    # Update the latest timestamp
    if submission.created_utc > new_last_timestamp:
        new_last_timestamp = submission.created_utc

    
    # Crawl comments
    submission.comments.replace_more(limit=None)
    comments = submission.comments.list()

    # calculate the various scores.
    raw_sentiment_score = 0.0
    categories = []  # e.g., ["Exams", "Facilities"]
    emotion = "Neutral"
    

    # get the engagement score.
    upvotes = submission.score
    comments_count = submission.num_comments
    engagement_score = (upvotes + 1) * math.log2(comments_count + 1)

    # summ of comment sentiment.
    sum_comment_sentiment = 0

    combined_post_comments = ""
    combined_post_comments += submission.selftext

    
    #------ SAVE TO Firebase database ----------------
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


    #save_to_file(post_filename, post_content)
    
    #comments_filename = os.path.join(output_dir, f"{submission.id}_comments.txt")
    #comments_content = ""

    weighted_sentiment_sum = 0.0
    total_weight = 0.0
    raw_sentiment_score = 0.0
    
    for comment in comments:
        combined_post_comments += f"\n{comment.body}"
        prompt = f"""
        Review the following text and provide a concise output in this format: 
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
        response = model.generate_content(prompt)
        response = response.text.strip()

        # Expected format: "<sentiment>,<emotion>,<category>,<iit_flag>"
        parts = response.split(',')

        if len(parts) < 4:
            print("Unexpected response format:", response)
        else:
            sentiment = int(parts[0].strip())
            emotion = parts[1].strip()
            category = parts[2].strip()
            iit_flag = parts[3].strip()  # Expected to be "yes" or "no"

        # For debugging or further processing:
        # print("Sentiment:", sentiment)
        # print("Emotion:", emotion)
        # print("Category:", category)
        # print("IIT:", iit_flag)

        # Compute a weight for the comment based on its score.
        # Use a logarithmic scale; if comment.score is negative, default to a minimal weight of 1.
        weight = 1 + math.log2(max(comment.score, 0) + 1)

        # Accumulate weighted sentiment and total weight.
        weighted_sentiment_sum += sentiment * weight
        total_weight += weight
        raw_sentiment_score += sentiment

        #print(response)
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
    
    #save_to_file(comments_filename, comments_content)
    
    prompt = f"""
    Review the following text and provide a concise output in this format: 
    a sentiment score (1 for positive, -1 for negative, or 0 for neutral), 
    then a comma, the identified emotion (happy, relief, stress, frustration, 
    pride, disappointment, confusion, neutral), another comma, the determined category 
    (academic, exams, facilities, subjects, administration, career, admission, results, internship,
    lecturer, student life, infrastructure, classroom, events, CCA), 
    and finally, another comma followed by "yes" or "no" indicating whether the text 
    relates to the School of IIT (or the School of Informatics & IT, which includes
    programs like Big Data Analytics, Applied AI, IT, Cybersecurity & Digital Forensics, 
    Immersive Media & Game Development and Common ICT. Put "yes" only if any of the below keywords
    is found in the text "IT", "IIT", "BDA", "CDF","AAI", "IGD"), a comma followed by the summary of the text.
    Text: "{combined_post_comments}"
    """
    response = model.generate_content(prompt)
    response = response.text.strip()

    # Expected format: "<sentiment>,<emotion>,<category>,<iit_flag>"
    parts = response.split(',')

    if len(parts) < 5:
        print("Unexpected response format:", response)
    else:
        sentiment = int(parts[0].strip())
        emotion = parts[1].strip()
        category = parts[2].strip()
        iit_flag = parts[3].strip()  # Expected to be "yes" or "no"
        summary = parts[4].strip()
        
    # Calculate the weighted sentiment score for the post
    weighted_sentiment_score = weighted_sentiment_sum / total_weight if total_weight > 0 else 0
    # Update the post document with the calculated weighted sentiment score
    post_ref.update({"weightedSentimentScore": weighted_sentiment_score})
    post_ref.update({"rawSentimentScore": raw_sentiment_score})
    post_ref.update({"summary": summary})
    post_ref.update({"sentiment": sentiment})
    post_ref.update({"emotion": emotion})
    post_ref.update({"category": category})
    post_ref.update({"iit": iit_flag})
    print(f"weightedSentimentScore: {weighted_sentiment_score}, rawSentimentScore: {raw_sentiment_score}")


# Save the new last timestamp for the next run
set_last_timestamp(new_last_timestamp)

print("Incremental crawling completed. Data saved to", output_dir)

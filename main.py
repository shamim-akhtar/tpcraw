import praw
import os
import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Reddit API credentials
REDDIT_CLIENT_ID = os.getenv('REDDIT_CLIENT_ID')
REDDIT_CLIENT_SECRET = os.getenv('REDDIT_CLIENT_SECRET')
REDDIT_USER_AGENT = os.getenv('REDDIT_USER_AGENT')

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

# Crawl new posts and comments incrementally
for submission in subreddit.new(limit=100):  # Using 'new' to get recent posts
    if submission.created_utc <= last_timestamp:
        continue
    
    # Update the latest timestamp
    if submission.created_utc > new_last_timestamp:
        new_last_timestamp = submission.created_utc

    post_filename = os.path.join(output_dir, f"{submission.id}_post.txt")
    
    # Extract post information
    post_content = f"Title: {submission.title}\n"
    post_content += f"Author: {submission.author}\n"
    post_content += f"Score: {submission.score}\n"
    post_content += f"URL: {submission.url}\n"
    post_content += f"Created: {datetime.datetime.fromtimestamp(submission.created_utc)}\n"
    post_content += f"Body: {submission.selftext}\n"
    
    save_to_file(post_filename, post_content)
    
    # Crawl comments
    submission.comments.replace_more(limit=None)
    comments = submission.comments.list()
    
    comments_filename = os.path.join(output_dir, f"{submission.id}_comments.txt")
    comments_content = ""
    
    for comment in comments:
        comments_content += f"Comment by {comment.author}: {comment.body}\n\n"
    
    save_to_file(comments_filename, comments_content)

# Save the new last timestamp for the next run
set_last_timestamp(new_last_timestamp)

print("Incremental crawling completed. Data saved to", output_dir)

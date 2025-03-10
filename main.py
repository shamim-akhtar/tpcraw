import praw
import os
import datetime
import os
from dotenv import load_dotenv

load_dotenv()

REDDIT_CLIENT_ID=os.getenv('REDDIT_CLIENT_ID')
REDDIT_CLIENT_SECRET=os.getenv('REDDIT_CLIENT_SECRET')
REDDIT_USER_NAME=os.getenv('REDDIT_USER_NAME')
REDDIT_USER_PASSWORD=os.getenv('REDDIT_USER_PASSWORD')
REDDIT_USER_AGENT=os.getenv('REDDIT_USER_AGENT')
OPENAI_API_KEY=os.getenv('OPENAI_API_KEY')

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

def save_to_file(filename, content):
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

# Crawl the top posts of all time
for submission in subreddit.top(limit=100):
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

print("Crawling completed. Data saved to", output_dir)

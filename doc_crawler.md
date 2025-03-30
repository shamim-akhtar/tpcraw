## Crawler.py Technical Documentation

### Overview

The `crawler.py` script is a Python-based data ingestion tool designed to fetch and process posts and comments from the `r/TemasekPoly` subreddit. The script stores the processed data in a Firebase Firestore database, and uses the Google Gemini API for Natural Language Processing (NLP) tasks such as sentiment analysis, emotion detection, category classification, and IIT relevance determination.

### Purpose

The primary purpose of this crawler is to extract relevant discussions from Reddit, perform sentiment analysis, categorize the content, and store the processed data for further visualization and analysis via a dashboard built using Chart.js and Firebase Firestore.
#### Key Features:

1. **Data Collection & Storage:**
   - Fetches posts and comments from `r/TemasekPoly`.
   - Stores processed data in Firebase Firestore under a structured schema.
   - Ensures previously processed posts and comments are not duplicated.

2. **Sentiment Analysis:**
   - Utilizes the Google Gemini API for natural language understanding.
   - Categorizes content by sentiment, emotion, category, and relevance to IIT.
   - Calculates weighted sentiment scores considering user engagement (comments and upvotes).

3. **Data Aggregation & Incremental Updating:**
   - Uses incremental updates to keep Firestore statistics accurate and up-to-date.
   - Supports continuous learning by tracking historical sentiment trends.

4. **Error Handling & Logging:**
   - Logs all errors to `crawler_errors.log` for easy debugging and troubleshooting.
   - Resilient against API failures or Firestore connectivity issues.

5. **Scheduled Crawling:**
   - Integrated with GitHub Actions to run daily at 5 AM Singapore Time.
   - Ensures regular data collection without manual intervention.


### Dependencies
- `praw`: For interacting with Reddit's API to fetch posts and comments.
- `firebase-admin`: For connecting and saving data to Firebase Firestore.
- `google-generativeai`: For leveraging Google's Gemini API to analyze text data.
- `python-dotenv`: For managing environment variables.
- `logging`: For error tracking and troubleshooting.
- `math`: For calculations related to weighted sentiment scores.

Install dependencies via:
```
pip install praw firebase-admin google-generativeai python-dotenv
```

### Files
- `crawler.py`: The main crawler script.
- `.env`: Contains sensitive information like API keys for Reddit and Google Gemini API.
- `firebase-credentials.json`: Firebase service account key file for Firestore authentication.
- `last_timestamp.txt`: Stores the timestamp of the last successfully processed post to prevent redundant processing.
- `crawler_errors.log`: Stores error logs generated during script execution.
- `.github/workflows/reddit-crawler.yml`: GitHub Actions workflow file to schedule and trigger the crawler automatically.

### Firestore Structure
```
posts (collection)
 └─ {post_id} (document)
     ├─ title
     ├─ author
     ├─ body
     ├─ summary (AI-generated)
     ├─ engagementScore
     ├─ rawSentimentScore
     ├─ weightedSentimentScore
     ├─ emotion
     ├─ category
     ├─ iit (yes/no)
     ├─ totalComments
     ├─ totalPositiveSentiments
     ├─ totalNegativeSentiments
     └─ comments (subcollection)
          └─ {comment_id} (document)
               ├─ body
               ├─ author
               ├─ score
               ├─ sentiment
               ├─ emotion
               ├─ category
               └─ iit

meta (collection)
 └─ last_timestamp (document)
      └─ value (float)

category_stats (collection)
 └─ {date_str} (document)
     └─ {category} (field)
         ├─ totalSentiment
         ├─ count
         ├─ positiveCount
         ├─ negativeCount
         ├─ averageSentiment
         ├─ postIds
         └─ comments

authors (collection)
 └─ {author_name} (document)
     ├─ totalSentimentScore
     ├─ postCount
     ├─ commentCount
     ├─ negativeCount
     ├─ positiveCount
     ├─ averageSentiment
     ├─ posts
     └─ comments
```

### Initialization

The script loads environment variables, initializes the Reddit API via `praw`, and sets up Firebase Firestore.

```python
from dotenv import load_dotenv
import praw
import os
import firebase_admin
from firebase_admin import credentials, firestore

load_dotenv()

# Initialize Reddit API
reddit = praw.Reddit(
    client_id=os.getenv('REDDIT_CLIENT_ID'),
    client_secret=os.getenv('REDDIT_CLIENT_SECRET'),
    user_agent=os.getenv('REDDIT_USER_AGENT')
)

# Initialize Firebase Firestore
cred = credentials.Certificate('firebase-credentials.json')
firebase_admin.initialize_app(cred)
db = firestore.client()
```

### Scheduling Using GitHub Actions

The crawler is scheduled to run at **5 AM Singapore Time (UTC+8)** using **GitHub Actions**. This allows automated crawling without manual intervention.

Create a `.github/workflows/reddit-crawler.yml` file in your repository:

```yaml
name: Reddit Crawler - Daily 5AM

on:
  schedule:
    - cron: '0 21 * * *'  # 9PM UTC = 5AM SGT
  workflow_dispatch:      # Optional: allows manual runs

jobs:
  run-crawler:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Repo
        uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'

      - name: Install Dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
      - name: Restore firebase-credentials.json from Base64 secret
        run: |
          echo "${{ secrets.FIREBASE_CREDENTIALS_BASE64 }}" | base64 -d > firebase-credentials.json
      - name: Create .env file
        run: |
          echo "REDDIT_CLIENT_ID=${{ secrets.REDDIT_CLIENT_ID }}" >> .env
          echo "REDDIT_CLIENT_SECRET=${{ secrets.REDDIT_CLIENT_SECRET }}" >> .env
          echo "REDDIT_USER_AGENT=${{ secrets.REDDIT_USER_AGENT }}" >> .env
          echo "GOOGLE_GEMINI_API_KEY=${{ secrets.GOOGLE_GEMINI_API_KEY }}" >> .env
      - name: Run Reddit Crawler
        run: python crawler.py

```

The `cron` setting above is configured to run the crawler daily at 5 AM Singapore Time (UTC+8). Adjust the time as needed.

---

### Crawler Functions

#### 1. `get_last_timestamp()`

**Purpose:**  
This function retrieves the timestamp of the last successfully processed Reddit post. This timestamp is essential for ensuring that the crawler doesn't reprocess posts that have already been captured in previous runs. This timestamp-based incremental processing ensures efficiency and prevents unnecessary reprocessing of old data. Without this, the script would waste resources by repeatedly analyzing the same posts.

**Implementation:**  
```python
def get_last_timestamp():
    try:
        doc = db.collection("meta").document("last_timestamp").get()
        if doc.exists:
            return doc.to_dict().get("value", 0)
    except Exception as e:
        logging.error(f"Error fetching last_timestamp from Firestore: {e}")
    return 0
```

**Functionality:**  
- **Fetches** the document named `last_timestamp` from the Firestore collection named `meta`.
- If the document exists, it **extracts the `value` field**, which contains the timestamp of the last successfully processed post.
- If the document doesn't exist or if there's an error, it logs the error and returns `0` (indicating that all posts should be processed).

**Error Handling:**  
- If Firestore access fails, the error is logged using Python’s `logging` module.

---
#### 2. `set_last_timestamp()`

**Purpose:**  
This function updates the timestamp of the most recently processed Reddit post in Firestore. By recording this timestamp, the crawler can avoid reprocessing older posts during subsequent runs.
- Ensuring that the `last_timestamp` is updated successfully is crucial for the script’s ability to resume processing where it left off.
- Avoids duplication of data by skipping posts that have already been processed, optimizing performance and storage usage.

**Implementation:**  
```python
def set_last_timestamp(timestamp):
    try:
        db.collection("meta").document("last_timestamp").set({"value": timestamp})
    except Exception as e:
        logging.error(f"Error saving last_timestamp to Firestore: {e}")
```

**Functionality:**  
- **Saves the given timestamp** to a document named `last_timestamp` within the `meta` collection in Firestore.
- The timestamp is stored as a dictionary with a single key-value pair: `{ "value": timestamp }`.

**Error Handling:**  
- If there is an issue saving the timestamp to Firestore, the error is **logged** for further analysis.


---
#### 3. `safe_generate_content()`

**Purpose:**  
This function is designed to **safely generate text content using the Google Gemini API**. It implements a retry mechanism to handle API failures gracefully.

**Implementation:**  
```python
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
```

**Functionality:**  
- **Takes three parameters:**
  - `model`: The Google Gemini API model instance used for generating content.
  - `prompt`: The input prompt sent to the Gemini API for processing.
  - `retries`: The maximum number of attempts to try before giving up (default is 3).
  - `delay`: The number of seconds to wait between retries (default is 5 seconds).
- Attempts to generate content by calling the `model.generate_content(prompt)`.
- If a valid response is received, it returns the processed text after stripping extra spaces.
- If the response is invalid or fails, the function retries the process up to the specified retry limit (`retries`).

**Error Handling:**  
- All errors are logged to `crawler_errors.log` with details about the failure and the retry attempt number.
- If all retries fail, a fallback message is returned to prevent the script from breaking.

**Why This Is Important:**  
- Google Gemini API calls can occasionally fail due to network issues, API limits, or server errors.
- Implementing retries enhances robustness and ensures that temporary issues don’t halt the crawling process.
- Ensures that missing or incomplete results are handled gracefully, which improves the user experience.

---
#### 4. `update_author_stats()`

**Purpose:**  
This function **updates statistics related to Reddit authors** in the Firestore database. It records details such as sentiment scores, post counts, comment counts, and their respective sentiment distribution. This helps in analyzing the most influential or active authors in the subreddit.

**Implementation:**  
```python
def update_author_stats(author, sentiment, is_post=True, post_id=None, comment_id=None):
    try:
        author_ref = db.collection("authors").document(author)
        author_doc = author_ref.get()

        # If the author doesn't exist, create a new entry with extra fields.
        if not author_doc.exists:
            author_stats = {
                "totalSentimentScore": 0,
                "postCount": 0,
                "commentCount": 0,
                "negativeCount": 0,
                "positiveCount": 0,
                "averageSentiment": 0,
                "posts": [],
                "comments": {}
            }
        else:
            author_stats = author_doc.to_dict()
            if "posts" not in author_stats:
                author_stats["posts"] = []
            if "comments" not in author_stats:
                author_stats["comments"] = {}

        # Update sentiment and counts
        author_stats["totalSentimentScore"] += sentiment
        if is_post:
            author_stats["postCount"] += 1
            if post_id and post_id not in author_stats["posts"]:
                author_stats["posts"].append(post_id)
        else:
            author_stats["commentCount"] += 1
            if post_id and comment_id:
                if post_id not in author_stats["comments"]:
                    author_stats["comments"][post_id] = []
                if comment_id not in author_stats["comments"][post_id]:
                    author_stats["comments"][post_id].append(comment_id)

        # Calculate average sentiment
        total_interactions = author_stats["postCount"] + author_stats["commentCount"]
        author_stats["averageSentiment"] = (author_stats["totalSentimentScore"] / total_interactions) if total_interactions > 0 else 0

        # Save the updated stats back to Firestore
        author_ref.set(author_stats)

    except Exception as e:
        logging.error(f"Error updating author stats for {author}: {e}")
```

**Functionality:**  
- **Creates or updates a document** within the `authors` collection, where each document ID is the `author` name.
- **Tracks the following metrics for each author:**
  - `totalSentimentScore`: Cumulative score of all sentiments associated with the author’s posts and comments.
  - `postCount`: Total number of posts made by the author.
  - `commentCount`: Total number of comments made by the author.
  - `negativeCount`: Number of negative sentiments detected from the author's posts/comments.
  - `positiveCount`: Number of positive sentiments detected from the author's posts/comments.
  - `averageSentiment`: Average sentiment score calculated from the total sentiment score divided by the total number of interactions.
  - `posts`: List of post IDs made by the author.
  - `comments`: Dictionary mapping post IDs to lists of comment IDs made by the author.
- **Calculates the average sentiment** for the author using the formula:
  ```python
  total_interactions = author_stats["postCount"] + author_stats["commentCount"]
  author_stats["averageSentiment"] = (author_stats["totalSentimentScore"] / total_interactions) if total_interactions > 0 else 0
  ```
- Saves the updated author stats back to Firestore.

**Error Handling:**  
- Logs any errors that occur during the update process, ensuring issues are traceable.

**Why This Is Important:**  
- This function enables **author-level analytics**. By storing cumulative and average sentiment scores, the dashboard can identify key influencers, constructive contributors, or frequent critics.
- Helps in filtering and analyzing content by specific authors for deeper insights.

---
### 5. `update_category_stats_incremental()`

**Purpose:**  
This function **incrementally updates category-specific sentiment statistics** in the Firestore database. It records daily statistics for each category, including sentiment scores, counts, positive/negative breakdowns, and post/comment IDs.

---

**Implementation:**  
```python
def update_category_stats_incremental(date_str, category, sentiment, post_id=None, comment_id=None):
    doc_ref = db.collection("category_stats").document(date_str)
    transaction = db.transaction()

    @firestore.transactional
    def update_in_transaction(transaction, doc_ref):
        snapshot = doc_ref.get(transaction=transaction)
        if snapshot.exists:
            data = snapshot.to_dict()
        else:
            data = {}
            
        if category not in data:
            data[category] = {
                "totalSentiment": 0,
                "count": 0,
                "positiveCount": 0,
                "negativeCount": 0,
                "postIds": [],
                "comments": {}  # Dictionary mapping post IDs to lists of comment IDs
            }
            
        cat_data = data[category]
        cat_data["totalSentiment"] += sentiment
        cat_data["count"] += 1
        
        if sentiment > 0:
            cat_data["positiveCount"] += 1
        elif sentiment < 0:
            cat_data["negativeCount"] += 1
            
        if post_id:
            if post_id not in cat_data["postIds"]:
                cat_data["postIds"].append(post_id)
                
        if comment_id and post_id:
            if post_id not in cat_data["comments"]:
                cat_data["comments"][post_id] = []
            if comment_id not in cat_data["comments"][post_id]:
                cat_data["comments"][post_id].append(comment_id)
        
        # Update the average sentiment
        cat_data["averageSentiment"] = cat_data["totalSentiment"] / cat_data["count"]
        data[category] = cat_data
        transaction.set(doc_ref, data)

    update_in_transaction(transaction, doc_ref)
```

---

**Functionality:**  
- **Updates a daily document** in the `category_stats` collection, where each document ID corresponds to a specific date (e.g., `2025-03-30`).
- Each document contains statistics for various categories like `academic`, `exams`, `facilities`, etc.
- Updates are **performed within a Firestore transaction** to prevent data corruption from simultaneous writes.
- Adds or updates the following fields for a given category:
  - `totalSentiment`: Cumulative sentiment score for the category on that date.
  - `count`: Total number of interactions (posts or comments) in that category.
  - `positiveCount`: Number of positive sentiments.
  - `negativeCount`: Number of negative sentiments.
  - `averageSentiment`: Calculated as `totalSentiment / count`.
  - `postIds`: List of post IDs contributing to the category.
  - `comments`: A dictionary mapping post IDs to lists of comment IDs related to that category.

---

**Error Handling:**  
- The function uses **Firestore transactions** to ensure atomicity and prevent partial updates or race conditions.
- If a transaction fails, it will be retried according to Firestore's internal transaction management.

---

**Why This Is Important:**  
- Enables **real-time incremental updates** for each category's statistics, allowing for accurate tracking of sentiment trends over time.
- Provides valuable insights into which topics are discussed most frequently and whether they are positively or negatively received.
- Essential for generating time-series data visualizations on the dashboard.

---

### 6. `process_posts()`

**Purpose:**  
The `process_posts()` function processes all new posts stored in Firestore and updates the `category_stats` collection incrementally. It ensures that each post’s sentiment is correctly categorized and recorded for statistical analysis.

---

**Implementation:**  
```python
def process_posts():
    """Process all new posts in Firestore and update category_stats incrementally."""
    posts = db.collection("posts").stream()
    for post in posts:
        data = post.to_dict()
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
            post_id = post.id
            # Update category_stats incrementally with the post's sentiment and ID.
            update_category_stats_incremental(date_str, category, sentiment, post_id=post_id)
```

---

**Functionality:**  
- **Fetches all documents** from the `posts` collection in Firestore.
- **Loops through each post** to determine if it contains the necessary fields:
  - `created`: The timestamp when the post was created.
  - `category`: The category determined by the Google Gemini API.
  - `sentiment`: The sentiment score calculated for the post.
- Converts the `created` timestamp to a datetime object and formats it as a string (`YYYY-MM-DD`).
- Calls the `update_category_stats_incremental()` function to **record the post's sentiment data** for the specified date and category.

---

**Error Handling:**  
- The function gracefully **skips posts** that do not contain the required fields (`created`, `category`, `sentiment`).
- It also checks for valid datetime objects before proceeding, ensuring compatibility with Firestore timestamp formats.

---

**Why This Is Important:**  
- Ensures that all posts are processed and their statistics are **recorded incrementally** for analysis.
- Facilitates the generation of charts and graphs based on categorized sentiment data.
- Provides historical sentiment trends for each category, enabling deeper insights into community feedback and discussions.

---

### 7. `process_comments()`

**Purpose:**  
The `process_comments()` function processes all new comments associated with posts in Firestore and updates the `category_stats` collection incrementally. This ensures that sentiment and category statistics are accurately updated as new comments are added.

---

**Implementation:**  
```python
def process_comments():
    """Process new comments from all posts and update category_stats incrementally."""
    posts = db.collection("posts").stream()
    for post in posts:
        post_id = post.id
        comments = db.collection("posts").document(post_id).collection("comments").stream()
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
                comment_id = comment.id
                # Update category_stats incrementally with the comment's sentiment,
                # and record the comment ID under its parent post.
                update_category_stats_incremental(date_str, category, sentiment, post_id=post_id, comment_id=comment_id)
```

---

**Functionality:**  
- **Fetches all posts** from the `posts` collection.
- For each post, **retrieves all associated comments** from the subcollection `comments`.
- **Processes each comment** if it contains the required fields:
  - `created`: The timestamp when the comment was created.
  - `category`: The category assigned to the comment by the Gemini API.
  - `sentiment`: The sentiment score calculated for the comment.
- Converts the `created` timestamp to a datetime object and formats it as a string (`YYYY-MM-DD`).
- Calls the `update_category_stats_incremental()` function to **record the comment's sentiment data** under the appropriate category and date.

---

**Error Handling:**  
- The function **skips comments** that are missing essential data fields (`created`, `category`, `sentiment`).
- Ensures compatibility with Firestore timestamp formats by converting them to datetime objects before processing.
- Relies on the transactional nature of `update_category_stats_incremental()` to avoid corruption from simultaneous writes.

---

**Why This Is Important:**  
- Captures user feedback beyond just posts—comments often contain valuable insights, complaints, or praise.
- Ensures that statistics are **incrementally updated** to reflect real-time sentiment and engagement trends.
- Essential for producing accurate **category-based sentiment analysis** over time.

---
### 8. **Core Processing Loop (Post & Comment Crawling, Sentiment Analysis, and Data Storage)**

**Purpose:**  
This block of code is the **heart of the crawler**, where posts and their comments are fetched from `r/TemasekPoly`, analyzed using the Google Gemini API, and stored in Firestore. It also updates Firestore with various statistics (sentiment scores, categories, etc.) for each post and comment.

---

**Implementation:**

```python
# Get the last timestamp
last_timestamp = get_last_timestamp()
new_last_timestamp = last_timestamp

# Configure Gemini API
genai.configure(api_key=GOOGLE_GEMINI_API_KEY)
model = genai.GenerativeModel()  # Use 'gemini-pro-vision' for multimodal

# ADDED: Counter for the number of new posts updated
updated_posts_count = 0

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

            # Initialize sentiment data variables
            weighted_sentiment_sum = 0.0
            total_weight = 0.0
            raw_sentiment_score = 0.0
            total_comments = 0
            total_positive_sentiments = 0
            total_negative_sentiments = 0

            combined_post_comments = submission.selftext
```

---

**Functionality:**

- **Fetches posts** from the subreddit using:
  ```python
  for submission in subreddit.new(limit=500):
  ```
  This line fetches the 500 most recent posts from `r/TemasekPoly`.
  
- **Skips posts already processed** by comparing their timestamp against the stored `last_timestamp`.
- **Updates `new_last_timestamp`** to ensure that the latest processed post is recorded for future runs.

---

**Comment Crawling & Sentiment Analysis:**

```python
submission.comments.replace_more(limit=None)
comments = submission.comments.list()

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
    response_text = safe_generate_content(model, prompt)
```

---

**Functionality (Continued):**

- **Fetches all comments** for each post using:
  ```python
  submission.comments.replace_more(limit=None)
  ```
  This ensures that **all comments** (including those nested under others) are captured.
  
- **Analyzes comments** by calling `safe_generate_content()` with a specially crafted prompt.
  - The prompt asks the Gemini API to determine:
    - **Sentiment Score** (`1`, `0`, `-1`).
    - **Emotion** (e.g., happy, stress, frustration, neutral).
    - **Category** (e.g., academic, facilities, internship, etc.).
    - **IIT relevance** (`yes` or `no`).

- **Combines all comments into one text block** (`combined_post_comments`) for aggregated analysis.

---

**Data Storage & Firestore Updates:**

```python
post_ref = db.collection("posts").document(submission.id)
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
post_ref.set(post_doc)
```

---

**Functionality (Continued):**

- **Stores each post's data** in Firestore under the `posts` collection, with `submission.id` as the document ID.
- **Updates Firestore** with:
  - `title`, `author`, `body`, `URL`, `created` timestamp, `score`.
  - `rawSentimentScore`, `weightedSentimentScore`, `categories`, `emotion`.
  - `engagementScore` calculated from upvotes and comments.

---

**Why This Is Important:**  

- This core processing loop integrates all essential functionalities of the crawler:
  - **Fetching data** from Reddit using `praw`.
  - **Analyzing data** using the Google Gemini API.
  - **Storing processed data** in Firestore for further analysis.
  - **Ensuring incremental updates** by managing timestamps and using transactional updates in Firestore.

---
### 9. **Post-Processing & Firestore Updates**

**Purpose:**  
After collecting the posts and comments, this section of the crawler script **processes the data** to generate sentiment scores, summaries, and updates statistics in Firestore for each post.

---

### Implementation (Post-Processing Loop)

```python
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
relates to the School of IIT (or the School of Informatics & IT).
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

```

---

### Functionality:

1. **Aggregated Sentiment Analysis:**
   - Combines all comments under a single post into a single text block (`combined_post_comments`).
   - Sends this combined text to the Google Gemini API for a comprehensive sentiment analysis.

2. **API Prompt Request:**
   - The prompt requests the following attributes from the Gemini API:
     - **Sentiment Score:** (`1` for positive, `0` for neutral, `-1` for negative).
     - **Emotion:** (e.g., happy, relief, stress, frustration, etc.).
     - **Category:** (e.g., academic, exams, facilities, etc.).
     - **IIT Relevance:** (`yes` or `no`).
   - The model is expected to return results in a comma-separated format for easy parsing.

3. **Error Handling & Logging:**
   - If the response from the API is not in the expected format, an error is logged.
   - Invalid or unrecognized responses are logged for further review.

---

### Implementation (Summary Generation & Firestore Update)

```python
prompt_summary = f"""
You are an AI tasked with analyzing a Reddit post and its accompanying comments about 
Temasek Polytechnic. Perform the following steps:

1. Provide a concise paragraph summarizing the key topics, issues, or themes discussed.
2. Describe the overall sentiment and emotional tone expressed.
3. Include any concerns raised or constructive suggestions for school authorities.

If the provided text lacks sufficient content for analysis, state:
“The text does not contain enough meaningful information to generate a summary.”
Text: "{combined_post_comments}"
"""

summary = safe_generate_content(model, prompt_summary)

# Calculate the weighted sentiment score for the post
weighted_sentiment_score = weighted_sentiment_sum / total_weight if total_weight > 0 else 0

# Update the post document with the new data
post_ref.update({
    "weightedSentimentScore": weighted_sentiment_score,
    "rawSentimentScore": raw_sentiment_score,
    "summary": summary,
    "sentiment": sentiment,
    "emotion": emotion,
    "category": category,
    "iit": iit_flag,
    "totalComments": total_comments,
    "totalPositiveSentiments": total_positive_sentiments,
    "totalNegativeSentiments": total_negative_sentiments
})
```

---

### Functionality:

1. **Generating Post Summary:**
   - A separate prompt is used to generate a concise summary of the post and its comments.
   - The prompt instructs the API to highlight key topics, overall sentiment, and any constructive suggestions.

2. **Weighted Sentiment Calculation:**
   ```python
   weighted_sentiment_score = weighted_sentiment_sum / total_weight if total_weight > 0 else 0
   ```
   - Sentiment scores are weighted based on the popularity of comments (using upvotes).
   - Ensures that more relevant comments contribute more to the overall sentiment.

3. **Firestore Update:**
   - Updates the relevant `post` document with the processed data:
     - `weightedSentimentScore`, `rawSentimentScore`, `summary`, `sentiment`, `emotion`, `category`, `iit`.
     - Additionally, stores counts of total comments, positive sentiments, and negative sentiments.

---

### Why This Is Important:

- **Comprehensive Analysis:**  
  Aggregates multiple comments to provide a holistic sentiment score and summary for each post.
- **Accurate Weighting:**  
  Uses weighted sentiment scoring to prioritize influential comments.
- **Data Integrity:**  
  Ensures that all processed data is accurately updated in Firestore for later retrieval and analysis.

---
### 10. **Comment Crawling for Older Posts**

**Purpose:**  
This section of the crawler ensures that **new comments on previously processed posts** are also captured and analyzed. This is important because Reddit posts can continue to receive new comments long after the initial crawl.

---

### Implementation

```python
# HYBRID ADDITION: Track new comments on older posts
print("Scanning recent comments for updates to older posts...")
for comment in subreddit.comments(limit=500):
    try:
        # Ignore comments already processed
        comment_ref = db.collection("posts").document(comment.submission.id).collection("comments").document(comment.id)
        if comment_ref.get().exists:
            continue  # Already stored

        comment_created = datetime.datetime.fromtimestamp(comment.created_utc)
        if comment.created_utc <= last_timestamp:
            continue  # Already seen

        # Fetch parent post info
        post_id = comment.submission.id
        post_ref = db.collection("posts").document(post_id)
        post_snapshot = post_ref.get()

        if not post_snapshot.exists():
            continue  # Parent post was never processed (skip)

        print(f"New comment on old post {post_id}: {comment.id}")

        # Run Gemini prompt for single comment
        prompt = f'''
        You are an AI assigned to evaluate a Reddit post comment about 
        Temasek Polytechnic. Review the following text and provide a concise output in this format: 
        a sentiment score (1 for positive, -1 for negative, or 0 for neutral), 
        then a comma, the identified emotion (happy, relief, stress, frustration, 
        pride, disappointment, confusion, neutral), another comma, the determined category 
        (academic, exams, facilities, subjects, administration, career, admission, results, internship,
        lecturer, student life, infrastructure, classroom, events, CCA), 
        and finally, a comma followed by "yes" or "no" indicating whether the text 
        relates to the School of IIT (or the School of Informatics & IT).
        Text: "{comment.body}"
        '''
        response_text = safe_generate_content(model, prompt)
        parts = response_text.split(',')

        if len(parts) < 4:
            logging.error(f"[OLD POST] Unexpected response format for comment {comment.id}: {response_text}")
            continue

        sentiment = int(parts[0].strip())
        emotion = parts[1].strip()
        category = parts[2].strip()
        iit_flag = parts[3].strip()

        comment_doc = {
            "body": comment.body,
            "author": str(comment.author),
            "created": comment_created,
            "score": comment.score,
            "sentiment": sentiment,
            "emotion": emotion,
            "category": category,
            "iit": iit_flag,
        }
        comment_ref.set(comment_doc)
```

---

### Functionality:

1. **Scanning Recent Comments:**  
   - Uses `subreddit.comments(limit=500)` to **retrieve the most recent 500 comments** from `r/TemasekPoly`.
   - Focuses on **new comments made after the last crawling process**, using `comment.created_utc`.

2. **Checking Existing Comments:**  
   - The crawler checks Firestore to see if a comment has already been processed using:
     ```python
     if comment_ref.get().exists:
         continue  # Already stored
     ```
   - This prevents duplicate processing of the same comment.

3. **Fetching Parent Post Information:**  
   - Retrieves the parent post (`post_id`) for each comment.
   - Checks if the post exists in the Firestore database:
     ```python
     if not post_snapshot.exists():
         continue  # Parent post was never processed (skip)
     ```
   - Skips processing if the post is not stored in Firestore.

---

### Sentiment Analysis & Firestore Update:

1. **Gemini Prompt:**  
   - Uses the same format as the main post-processing loop to generate:
     - Sentiment score (`1`, `0`, `-1`).
     - Emotion (`happy`, `stress`, `neutral`, etc.).
     - Category (`academic`, `internship`, etc.).
     - IIT relevance (`yes` or `no`).
   - Processes individual comments using `safe_generate_content()` for resilience.

2. **Updating Firestore:**  
   - Stores each comment under the relevant post in Firestore:
     ```python
     comment_ref.set(comment_doc)
     ```
   - Ensures that **new comments on old posts** are accounted for in the dashboard.

---

### Why This Is Important:

- **Completeness:**  
  Ensures that ongoing discussions on older posts are captured and processed, providing more accurate and comprehensive sentiment analysis.
- **Historical Relevance:**  
  Reddit threads can remain active for weeks or months; this approach ensures that no valuable feedback is missed.
- **Data Integrity:**  
  Prevents duplicate entries by checking Firestore before processing new comments.

---

### 11. **Error Handling & Logging**

**Purpose:**  
The `crawler.py` script includes a comprehensive error-handling and logging system designed to **record errors, ensure resilience, and facilitate debugging**. Errors are logged to a file called `crawler_errors.log`.

---

### Implementation (Logging Setup)

```python
# Setup logging to file
logging.basicConfig(
    filename='crawler_errors.log',
    level=logging.ERROR,
    format='%(asctime)s %(levelname)s: %(message)s'
)
```

---

### Explanation:

1. **Logging Configuration:**
   - Logs are written to a file named `crawler_errors.log`.
   - The logging level is set to `logging.ERROR`, meaning only error messages and above (e.g., `CRITICAL`) are logged.
   - Logs are formatted to include:
     - **Timestamp:** When the error occurred (`%(asctime)s`).
     - **Severity Level:** The level of the log message (`%(levelname)s`), e.g., `ERROR`, `CRITICAL`.
     - **Message:** The actual error message or description (`%(message)s`).

---

### Usage of Logging in the Code

Throughout the `crawler.py` script, the `logging.error()` function is used to capture and store errors.

#### Example 1: Logging API Errors

```python
except Exception as e:
    logging.error(f"Error in generate_content: {e}. Attempt {attempt+1} of {retries}")
```
- Logs errors when the Google Gemini API fails to provide a response.
- Includes retry attempt information for easier debugging.

---

#### Example 2: Logging Firestore Errors

```python
except Exception as e:
    logging.error(f"Error saving last_timestamp to Firestore: {e}")
```
- Logs errors occurring when saving the timestamp to Firestore.

---

#### Example 3: Logging Unexpected API Responses

```python
if len(parts) < 4:
    logging.error(f"[OLD POST] Unexpected response format for comment {comment.id}: {response_text}")
```
- Logs cases where the API returns an improperly formatted response.

---

#### Example 4: Logging Critical Errors During Crawling

```python
except Exception as e:
    # Log any critical errors that occur during the crawling process
    logging.error(f"Critical error in crawling process: {e}")
```
- Catches **any unhandled exceptions** that may occur during the crawling process.
- Prevents the script from crashing due to unexpected errors.

---

### Why This Is Important:

1. **Improved Resilience:**  
   - By logging errors instead of crashing, the crawler can continue processing other posts and comments even if an error occurs.

2. **Debugging & Maintenance:**  
   - Provides detailed logs for debugging issues related to the Gemini API, Firestore interactions, or unexpected data formats.

3. **Continuous Improvement:**  
   - Allows you to identify areas where the code might need better handling or improvements.

4. **Post-Mortem Analysis:**  
   - Logs provide a way to perform a detailed analysis after the script runs, ensuring that issues are caught and resolved.

---
### Conclusion

The `crawler.py` script is a robust and comprehensive data collection, processing, and analysis tool designed to **extract sentiment insights from Reddit discussions on `r/TemasekPoly`**. It uses a combination of Reddit API, Firebase Firestore, and the Google Gemini API to **fetch, analyze, categorize, and store data** for visualization and trend analysis.

---


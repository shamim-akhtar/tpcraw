## Crawler.py Technical Documentation

### Overview

The `crawler.py` script is a Python-based data ingestion tool designed to fetch and process posts and comments from the `r/TemasekPoly` subreddit. The script stores the processed data in a Firebase Firestore database, and uses the Google Gemini API for Natural Language Processing (NLP) tasks such as sentiment analysis, emotion detection, category classification, and IIT relevance determination.

### Purpose

The primary purpose of this crawler is to extract relevant discussions from Reddit, perform sentiment analysis, categorize the content, and store the processed data for further visualization and analysis via a dashboard built using Chart.js and Firebase Firestore.

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
- `.github/workflows/crawl.yml`: GitHub Actions workflow file to schedule and trigger the crawler automatically.

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

### Conclusion

The `crawler.py` script, integrated with GitHub Actions, ensures the automation of the data collection process. This setup provides timely updates to your dashboard without manual intervention.

Next, I will document each key function in the crawler script in detail.


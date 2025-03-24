# TPCraw - TemasekPoly Reddit Sentiment Analysis 

TPCraw is a Python-based project that crawls posts and comments from the r/TemasekPoly subreddit and then analyzes them using Google’s Generative AI (Gemini). The project produces sentiment analyses, summaries, and visualizations (via a web-based dashboard) to gain insights into discussions about Temasek Polytechnic on Reddit.

[View the Dashboard](https://shamim-akhtar.github.io/tpcraw/).

## Features
- **Incremental Reddit Crawler**
Uses PRAW to fetch new posts and comments from r/TemasekPoly while avoiding duplicates.

- **Data Storage**
Stores posts and comments as plain-text files in a structured format.

- **AI-Based Analysis** Sentiment Analysis using Google Gemini for classifying text as positive, negative, or neutral.
Topic Extraction for categorizing discussions (e.g., facilities, academics, internships).
Summaries generate concise overviews of lengthy discussions.
- **Aggregated Results**
Combines raw and analyzed data, then saves them as JSON or CSV for further processing.

- **Interactive Dashboard**
An index.html file that uses Chart.js to visualize sentiment counts (positive vs. negative). Clicking a bar reveals additional details about the post and its comments, including AI analysis.

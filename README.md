# TPCraw - TemasekPoly Reddit Sentiment Analysis 
[![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_v2-2_01.PNG)](https://shamim-akhtar.github.io/tpcraw/)
TPCraw is a Python-based project that crawls posts and comments from the r/TemasekPoly subreddit and then analyzes them using Google’s Generative AI (Gemini). The project produces sentiment analyses, summaries, and visualizations (via a web-based dashboard) to gain insights into discussions about Temasek Polytechnic on Reddit.

[View the Dashboard](https://shamim-akhtar.github.io/tpcraw/).

---

## 📌 About This App

This application is a tool designed to gather, process, and visualize user-generated content from the Reddit community `r/TemasekPoly`. It consists of two major components:

1. **Crawler (Backend)** - Written in Python, it continuously collects posts and comments from Reddit, processes them for sentiment analysis, categorizes them, and stores them in Firebase Firestore. It leverages the Google Gemini API to extract meaningful insights such as sentiment score, emotion, category, and relevance to the School of IIT.

2. **Frontend Dashboard (UI)** - Built with HTML, CSS, and JavaScript, this dashboard provides a clean and interactive interface for visualizing the processed data. It includes various charts and graphs to display trends, sentiment distribution, engagement scores, and more.

The app runs automatically every day at **5 AM Singapore Time**, ensuring consistent and up-to-date data collection. It provides a robust framework for monitoring sentiment trends, analyzing user feedback, and identifying popular topics or concerns related to Temasek Polytechnic.

---

## Backend Crawler Features
### 🚀 **Automated Data Collection**

The crawler component of the application continuously collects user-generated content from the subreddit `r/TemasekPoly` on Reddit. It fetches both **posts and comments** using the PRAW (Python Reddit API Wrapper). This automated data gathering ensures that the application stays up-to-date with the latest discussions, feedback, and trends related to Temasek Polytechnic. The crawler retrieves a maximum of 500 recent posts and their associated comments each time it runs, providing a comprehensive dataset for further analysis.

### 🤖 **Sentiment Analysis using AI**

Leveraging the power of the **Google Gemini API**, the application processes each Reddit post and comment to extract insightful information such as:  

- **Sentiment Score:** Determines whether the content is Positive, Negative, or Neutral.  
- **Emotion Detection:** Identifies the emotional tone, such as Happy, Stress, Frustration, Pride, Disappointment, etc.  
- **Category Identification:** Classifies content into predefined categories like Academic, Exams, Facilities, Internship, CCA, and more.  
- **IIT Relevance Detection:** Distinguishes whether a post or comment is related to the School of IIT or not.  

The sentiment analysis enables the identification of themes, emotional trends, and areas of concern, providing valuable insights into how users feel about various aspects of Temasek Polytechnic.
### 💾 **Data Storage & Structuring**

All processed data is stored in **Firebase Firestore** using a well-defined and structured schema. This ensures efficient storage, quick retrieval, and organized management of posts, comments, and their related metadata. The data storage structure supports:  

- **Efficient Storage:** Posts, comments, and their metadata are saved in an organized manner for easy access and querying.  
- **Scalability:** The system can handle a growing volume of data without compromising performance, making it suitable for long-term sentiment analysis.  
- **Consistency:** Uses transactional updates to prevent data corruption, ensuring accuracy even when multiple updates are made simultaneously.  

By employing Firebase Firestore, the app benefits from high availability, real-time updates, and secure data handling, essential for a robust and reliable sentiment analysis platform.

### 📈 **Data Aggregation & Incremental Updating**

The application continuously aggregates and updates collected data to provide meaningful insights over time. It supports:  

- **Continuous Learning:** Aggregates historical sentiment data to identify patterns and trends across various categories.  
- **Incremental Updates:** Efficiently maintains and updates statistics for authors, categories, and posts without having to reprocess old data.  
- **Dynamic Categorization:** Tracks popular categories and detects shifts in user sentiments over time, allowing for a deeper understanding of evolving discussions.  

This feature ensures that the application provides accurate, up-to-date analysis while minimizing resource consumption through incremental data processing.

### 📃 **Error Handling & Logging**

The application is built with robust error handling mechanisms to ensure smooth operation even when encountering issues. It includes:  

-  **Error Logs:** All errors are recorded in a dedicated `crawler_errors.log` file for easy troubleshooting and debugging.  
-  **Retry Mechanisms:** Automatic retries are implemented for failed API requests or Firebase interactions, enhancing reliability.  
-  **Graceful Degradation:** If a non-critical component fails, the crawler continues processing other data without interruption.  

This resilience ensures that the application can handle unexpected issues without compromising data integrity or overall functionality.

### ⏰ **Scheduled Crawling with GitHub Actions**

The crawler is configured to run automatically every day at **5 AM Singapore Time** using **GitHub Actions**. This automated scheduling provides:  

- **Consistency:** Ensures data collection happens at regular intervals without requiring manual intervention.  
- **Timely Updates:** Captures ongoing discussions and sentiment trends as they happen, providing fresh insights for analysis.  
- **Automation:** Eliminates the need for manual triggering, enhancing reliability and efficiency.  

By leveraging GitHub Actions for scheduling, the application maintains a seamless and uninterrupted data collection process.

---

## 🌐 **Frontend Dashboard**

The Frontend Dashboard is a dynamic and user-friendly web interface built with **HTML, CSS, and JavaScript**. It serves as the primary visualization tool for the data collected by the Python crawler. Users can interact with various charts, tables, and filtering options to explore sentiment analysis results from `r/TemasekPoly`.

This dashboard allows users to:
- 📝 View aggregated sentiment data across multiple categories such as Academic, Exams, Internship, Facilities, etc.
- 📊 Analyze positive, neutral, and negative sentiments through **charts and graphs**.
- 📅 Track sentiment changes over time using **time series visualizations**.
- 🔍 Filter posts based on specific criteria like date range, categories, and IIT relevance.
- 📈 Examine top authors based on their sentiment contributions (positive and negative).
- 💬 Inspect individual posts and their associated comments to understand user feedback better.

The dashboard is implemented using **Chart.js** for visualization, **Firebase Firestore** for data retrieval, and **Chart.js Zoom Plugin** for interactive zooming and panning capabilities. It provides a comprehensive view of the sentiment trends and engagement metrics, making it easier to uncover valuable insights from the collected Reddit data.

## Frontend Dashboard Features
### 📅 **Date Range & IIT Filter**
![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_02.PNG)

The **Date Range & IIT Filter** feature provides users with flexible data filtering options, enabling customized analysis.

| Component | Function |
| :---- | :---- |
| **Start Date** | Choose the beginning of the analysis period. |
| **End Date** | Select the end date (defaults to today). |
| **IIT Checkbox** | A checkbox option allows users to filter posts specifically related to the **School of Informatics & IT (IIT)**. When enabled, only posts marked with a relevance flag (`iit: "yes"`) are displayed. This is particularly useful for examining feedback or discussions directly related to IIT courses or facilities. Results may not be very accurate as we are using Gen AI to categorize whether or not a post is associated with IIT. |
| **Filter Button** |  Once the desired filter criteria are set, clicking the "Filter" button updates all charts and visualizations in real-time, ensuring that only relevant data is displayed. |


This feature enhances the user’s ability to tailor their analysis to specific periods or areas of interest, making the dashboard versatile and adaptable.

### 📊 **Posts, Comments, and Avg Weighted Sentiment Metrics**

![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_03_1.PNG)

The **Posts, Comments, and Avg Weighted Sentiment Metrics** feature provides a quick summary of key data points, displayed prominently at the top of the dashboard.

| Component | Function |
| :---- | :---- |
| **Posts** | Displays the total number of posts retrieved from the Reddit subreddit `r/TemasekPoly` based on the selected date range and filters. This helps in quickly assessing the volume of discussions and interactions within a specified timeframe. |
| **Comments** | Shows the aggregate number of comments associated with the retrieved posts. This metric indicates the level of engagement and interest generated by the posts. |
| **Avg Weighted Sentiment** | Calculates the average sentiment score of all fetched posts. This score is weighted based on engagement metrics such as upvotes and comments, providing a balanced measure of user sentiment. |

These metrics offer a high-level overview of user engagement and sentiment trends, serving as a starting point for deeper analysis through the various charts and graphs available on the dashboard.

### 📊 **Sentiment Distribution Pie Chart**

![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_03_2.PNG)

The **Sentiment Distribution Pie Chart** provides a high-level overview of the sentiment breakdown across all posts within the selected date range. This chart categorizes sentiment into three primary groups:

-  **Positive**: Posts with favorable feedback or praise.
-  **Neutral**: Posts that are informational or express no particular sentiment.
-  **Negative**: Posts expressing criticism, dissatisfaction, or negative experiences.

The pie chart helps users quickly gauge the overall sentiment landscape by showing the proportion of each sentiment type. It is especially useful for identifying whether the general mood is positive, negative, or balanced. Users can apply filters to narrow down the data by date range or IIT-related content.

### 📈 **Weighted Sentiment Breakdown Chart**
![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_05.PNG)

The **Weighted Sentiment Breakdown Chart** displays the **Weighted Sentiment Scores** for individual posts based on the selected filters. Each bar in the chart represents a post, with the score indicating how positive or negative the overall sentiment is. 

-  **Positive Bars** (Green): Indicate favorable or appreciative sentiment.
-  **Negative Bars** (Red): Indicate critical or unfavorable sentiment.

The weighted sentiment score is calculated by combining the sentiment polarity of each post with engagement metrics such as comments and upvotes, providing a more accurate reflection of popular opinion. 

Users can click on a specific bar to view detailed post information, including its title, summary, and related comments. Additionally, the chart supports **zooming and panning**, enabling users to explore data at various levels of detail.

### 📊 **Comment Sentiment Stacked Chart**

The **Comment Sentiment Stacked Chart** provides a comprehensive view of user feedback by displaying **positive and negative sentiments** for comments on each post. 

- **Positive Sentiments** (Green): Reflect constructive, encouraging, or satisfied comments.
- **Negative Sentiments** (Red): Indicate criticisms, frustrations, or dissatisfaction expressed in comments.

This stacked chart helps identify the overall sentiment distribution across all comments for each post. The height of each bar indicates the total number of sentiments, making it easy to compare engagement levels and emotional responses.

The chart supports **interactive zooming and panning**, allowing users to closely examine specific posts or date ranges. Additionally, users can click on a bar to view the underlying comments and their detailed analysis.



### 💬 **Total Comments Chart**

The **Total Comments Chart** presents the total number of comments each post has received, visualized as a bar chart. 

- **Taller Bars:** Indicate posts with high community engagement and extensive discussions.
- **Shorter Bars:** Suggest posts that received little to no attention or feedback.

This chart is particularly useful for identifying which posts have sparked the most conversation. By clicking on a specific bar, users can view detailed insights about the post, including its content, sentiment analysis, and associated comments. The chart supports **zooming, panning, and filtering**, enhancing the exploration of high-engagement posts over time.


### 📈 **Engagement Score Chart**

The **Engagement Score Chart** visualizes the overall popularity and interaction level of each post. The **Engagement Score** is calculated by combining the number of upvotes and comments, factoring in their influence through a logarithmic scaling approach.

- **Higher Scores:** Indicate posts that have generated significant discussion or received numerous upvotes.
- **Lower Scores:** Suggest posts with minimal interaction or interest.

This bar chart allows users to quickly identify which posts have attracted the most attention and engagement from the community. Each bar represents a post, with taller bars indicating higher engagement. The chart supports **interactive zooming and panning**, allowing users to closely examine posts from different time periods. Additionally, clicking on a bar displays detailed information about the post.


### 👥 **Top 10 Authors with Most Negative Sentiments**

The **Top 10 Authors Chart** displays a stacked bar chart highlighting the authors with the most negative sentiments in their posts and comments. 

- **Green Bars:** Represent the positive sentiments contributed by an author.
- **Red Bars:** Represent the negative sentiments contributed by an author.

This feature is useful for identifying potential issues, complaints, or grievances that might need attention. It also allows for tracking individual authors over time to understand their overall sentiment trend. Clicking on any bar reveals all related posts and comments made by the selected author.

### 📅 **Category Time Series Analysis**

The **Category Time Series Chart** provides a powerful way to visualize sentiment trends over time for various categories. 

- **Raw Data Display:** Shows sentiment scores for each category as light, transparent lines.
- **7-Day Moving Average:** A smoother line representing the average sentiment over the last 7 days, providing a clearer view of overall trends.
- **Interactive Legend:** Users can toggle categories on and off, focusing on specific aspects such as *academic*, *internship*, *facilities*, etc.
- **Clickable Points:** Clicking on data points within the chart reveals all relevant posts and comments for that particular category and date.

This feature enables users to track how sentiment evolves across different categories over time, making it easier to spot emerging issues or improvements.

### 🔍 **Post Details Display**

The **Post Details Display** feature provides an in-depth view of a specific Reddit post and its associated comments when you click on any bar in the various charts.

**How It Works:**
- When you click on a bar in any of the charts (such as Weighted Sentiments, Comment Sentiments, Engagement Scores, etc.), a detailed view of the corresponding post is displayed.
- The post details are fetched dynamically from Firebase Firestore and displayed below the charts.

**Information Displayed:**
- **Post Title & Body:** The original content of the post as it appeared on Reddit.
- **Author Information:** Displays the username of the post author and the timestamp when the post was created.
- **Engagement Metrics:** Includes engagement score, weighted sentiment score, raw sentiment score, total positive sentiments, and total negative sentiments.
- **Emotion & Category Tags:** Labels generated by the AI model to categorize the content and detect the overall emotion conveyed.
- **Summary:** A concise summary of the post and its comments generated by the Google Gemini AI.
- **Comments List:** A detailed list of all comments related to the post, along with sentiment scores, emotions, categories, and IIT relevance.

The **Post Details Display** feature provides a comprehensive breakdown of each post, making it easy to dive into individual conversations and analyze specific interactions.

---

### version 2.3 - Current Version
**Implemented Time Series Aggregation for Sentiment by Category**
> Developed a one-time aggregation script that scans all posts and comments in Firestore to compute daily sentiment statistics for each category. The aggregated data is stored in a new collection, "category_stats", where each document is keyed by date (formatted as YYYY-MM-DD) and contains a map for each category (e.g., academic, exams, internship) with fields for totalSentiment, count, positiveCount, negativeCount, and averageSentiment. This enhancement enables detailed time-series analysis of sentiment trends, allowing us to identify patterns like exam stress spikes and post-holiday drops in facility complaints. Finally, once tested to work, added the functionality to the crawler.

**Visualize Time Series with Raw and 7-Day Moving Average Curves**
>
> This enhancement adds a new dashboard view to visualize the time series of average sentiment by category. It features a line chart that plots both the raw sentiment data (in a light, transparent line) and a smoothed 7-day moving average (in a solid line) for each category. By default, only the "academic" category is visible, and toggling a legend item will show or hide both the raw and smoothed curves for that category. Additionally, the y-axis is fixed between -1.2 and 1.2 to provide clear visual boundaries, making the trend analysis easier and reducing the impact of daily volatility.

### version 2.2
- [x] Implement Incremental Updates for Author Sentiment in Crawler
- [x] Add One-Time Author Sentiment Aggregation Script
- [x] Add Author Sentiment Stacked Bar Chart to Dashboard

### version 2.1
- [x] Enhance the post table with clickable rows to display full post details for Top 10 lists.
- [x] Colour highlight for selected row in the top 10 list.
- [x] Zoom control on chart and reset zoom.
- [x] Automated crawler job using GitHub workflow and action - runs at 5 AM Singapore time daily.
- [x] Track new comments on older posts.

### TODO
- [ ] Run analytics (e.g. temporal patterns) per author.


# **📊 Sentiment Dashboard User Guide**

Welcome to the **r/TemasekPoly Sentiment Dashboard**, a web-based analytics interface that visualizes and summarizes Reddit posts and comments related to Temasek Polytechnic. It leverages sentiment analysis powered by **Google Gemini API** and data from **Firebase Firestore**.

![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_01.PNG)


---

## **🧭 Dashboard Overview**



### **📊 B. Right Panel – Detailed Charts using Tab Navigation**

**Click any tab** to switch views.  
![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_04.PNG)

| Weighted Sentiment per Post | Shows each post's overall sentiment score, adjusted for popularity. Combines sentiment polarity with engagement (more weight to popular posts). Positive \= green, Negative \= red. |
| :---- | :---- |

![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_05.PNG)

| Comment Sentiments per Post | Stacked bar chart showing the number of positive (green) and negative (red) comments per post.  |
| :---- | :---- |

![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_06.PNG)

| Comments per Post | Simple bar chart showing how many comments each post received. |
| :---- | :---- |

##### 

![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_07.PNG)

| Engagement Score per Post | Bar chart reflecting interaction level (e.g., comment count \+ score). Higher \= more engaging. |
| :---- | :---- |

![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_08.PNG)

| Top 10 Posts | Dropdown-driven table view of the top/bottom posts based on various criteria. |
| :---- | :---- |

![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_09.PNG)

##### **🎯 Available Filters in Top 10 Posts dropdown:**

* Top 10 Engaged Posts  
* Lowest 10 Weighted Sentiment Posts  
* Lowest 10 Raw Sentiment Posts  
* Highest 10 Weighted Sentiment Posts  
* Highest 10 Raw Sentiment Posts  
* Top 10 Most Recent Posts

![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_10.PNG)

Each selection dynamically updates the table view.

---

## **📝 3\. Post Details Panel (Bottom)**

Whenever you **click a chart bar**, this section updates to show:

* Post title, author, and publish date  
* Link to the original Reddit post  
* AI-generated summary  
* Metadata tags (badges): category, emotion, engagement score, Reddit score, sentiment stats  
* Full post body (if available)  
* **All comments**, with:  
  * Author and timestamp  
  * Comment sentiment (badge)  
  * Emotion (badge)  
  * Reddit score

This section helps you **dive deep into user feedback and reactions**.

![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_11.PNG)

---

## **📌 How Sentiment Works**

| Term | Meaning |
| :---- | :---- |
| **Raw Sentiment Score** | Sentiment analysis output without any weighting. |
| **Weighted Sentiment Score** | Combines sentiment polarity with engagement (more weight to popular posts). |
| **Engagement Score** | Measures post popularity (e.g., number of comments and upvotes). |
| **Positive / Negative / Neutral** | Based on Gemini API's sentiment analysis of content. |

---

## **📉 Visual Cues & Color Legend**

| Color | What it Means |
| :---- | :---- |
| 🟢 Green | Positive sentiment or positive comment |
| 🔴 Red | Negative sentiment or negative comment |
| 🟣 Purple | Comment/Engagement quantity |
| 🟡 Yellow | Neutral sentiment (Pie Chart) |

## **🛠️ Technical Stack**

* **Frontend**: HTML5 \+ CSS3 \+ JavaScript  
* **Charts**: [Chart.js](https://www.chartjs.org/)  
* **Backend/Database**: Firebase Firestore  
* **Sentiment Analysis**: Google Gemini API  
* **Source Data**: Reddit posts and comments from [r/TemasekPoly](https://www.reddit.com/r/TemasekPoly/)

---

## **⚠️ Disclaimer**

The sentiment data shown is auto-generated using Google Gemini AI models. While generally accurate, edge cases may exist. Always **cross-reference with the post and comment content** for accurate interpretation.

---

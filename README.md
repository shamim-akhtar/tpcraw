# TPCraw - TemasekPoly Reddit Sentiment Analysis 

TPCraw is a Python-based project that crawls posts and comments from the r/TemasekPoly subreddit and then analyzes them using Google’s Generative AI (Gemini). The project produces sentiment analyses, summaries, and visualizations (via a web-based dashboard) to gain insights into discussions about Temasek Polytechnic on Reddit.

[View the Dashboard](https://shamim-akhtar.github.io/tpcraw/).


## Added Features

### version 2.2 - Current Version
- [x] Implement Incremental Updates for Author Sentiment in Crawler
- [x] Add One-Time Author Sentiment Aggregation Script
- [x] Add Author Sentiment Stacked Bar Chart to Dashboard

### version 2.1
- [x] Enhance the post table with clickable rows to display full post details for Top 10 lists.
- [x] Colour highlight for selected row in the top 10 list.
- [x] Zoom control on chart and reset zoom.
- [x] Automated crawler job using GitHub workflow and action - runs at 5 AM Singapore time daily.
- [x] Track new comments on older posts.

# **📊 Sentiment Dashboard User Guide**

Welcome to the **r/TemasekPoly Sentiment Dashboard**, a web-based analytics interface that visualizes and summarizes Reddit posts and comments related to Temasek Polytechnic. It leverages sentiment analysis powered by **Google Gemini API** and data from **Firebase Firestore**.

![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_01.PNG)


---

## **🧭 Dashboard Overview**

The dashboard consists of **three main areas**:

1. **Controls Panel (Top)**  
2. **Main Display (Center: Left and Right Panels)**  
3. **Footer (Bottom)**

---

## **🔧 1\. Controls Panel (Date & Filter Selection)**

![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_02.PNG)

| Component | Function |
| :---- | :---- |
| **Start Date** | Choose the beginning of the analysis period. |
| **End Date** | Select the end date (defaults to today). |
| **IIT Checkbox** | Toggle to include only posts associated with the **School of IIT**. |
| **Filter Button** | Apply all selected filters to refresh the dashboard. |

---

## **🗃️ 2\. Main Display Panel**

### **📌 A. Left Panel – Summary Boxes**

![](https://github.com/shamim-akhtar/tpcraw/blob/main/images/image_03.PNG)

| Box | Description |
| :---- | :---- |
| **Posts** | Total number of Reddit posts matching the selected filters. |
| **Comments** | Total number of comments across all posts. |
| **Avg Weighted Sentiment** | The average score combining post sentiment and engagement. |
| **Sentiments Distribution (Pie Chart)** | Breakdown of Positive / Neutral / Negative post sentiments as percentages. |

---

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

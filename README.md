# TPCraw - TemasekPoly Reddit Sentiment Analysis 

TPCraw is a Python-based project that crawls posts and comments from the r/TemasekPoly subreddit and then analyzes them using Google’s Generative AI (Gemini). The project produces sentiment analyses, summaries, and visualizations (via a web-based dashboard) to gain insights into discussions about Temasek Polytechnic on Reddit.

[View the Dashboard](https://shamim-akhtar.github.io/tpcraw/).

<section class="card" style="max-width: 1000px; margin: 20px auto; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6;">
  <h2>📊 Sentiment Dashboard User Guide</h2>
  <p>Welcome to the <strong>r/TemasekPoly Sentiment Dashboard</strong>, a web-based analytics interface that visualizes and summarizes Reddit posts and comments related to Temasek Polytechnic. It leverages sentiment analysis powered by <strong>Google Gemini API</strong> and data from <strong>Firebase Firestore</strong>.</p>

  <h3>🧭 Dashboard Overview</h3>
  <ol>
    <li><strong>Controls Panel (Top)</strong></li>
    <li><strong>Main Display (Center: Left and Right Panels)</strong></li>
    <li><strong>Footer (Bottom)</strong></li>
  </ol>

  <h3>🔧 1. Controls Panel (Date & Filter Selection)</h3>
  <ul>
    <li><strong>Start Date:</strong> Choose the beginning of the analysis period.</li>
    <li><strong>End Date:</strong> Select the end date (defaults to today).</li>
    <li><strong>IIT Checkbox:</strong> Toggle to include only posts associated with the <strong>School of IIT</strong>.</li>
    <li><strong>Filter Button:</strong> Apply all selected filters to refresh the dashboard.</li>
  </ul>

  <h3>🗃️ 2. Main Display Panel</h3>

  <h4>📌 A. Left Panel – Summary Boxes</h4>
  <ul>
    <li><strong>Posts:</strong> Total number of Reddit posts matching the selected filters.</li>
    <li><strong>Comments:</strong> Total number of comments across all posts.</li>
    <li><strong>Avg Weighted Sentiment:</strong> The average score combining post sentiment and engagement.</li>
    <li><strong>Sentiments Distribution (Pie Chart):</strong> Breakdown of Positive / Neutral / Negative post sentiments as percentages.</li>
  </ul>

  <h4>📊 B. Right Panel – Detailed Charts</h4>
  <p><strong>Tabs available:</strong></p>
  <ul>
    <li><strong>Weighted Sentiment per Post:</strong> Overall post sentiment, adjusted for popularity. Green = positive, Red = negative.</li>
    <li><strong>Comment Sentiments per Post:</strong> Stacked bars of positive (green) and negative (red) comment counts.</li>
    <li><strong>Comments per Post:</strong> Bar chart of comment count per post.</li>
    <li><strong>Engagement Score per Post:</strong> Measures interaction level—higher means more engagement.</li>
    <li><strong>Top 10 Posts:</strong> Table of best/worst performing posts by sentiment and engagement.</li>
  </ul>

  <p><strong>🎯 Top 10 Posts dropdown filters:</strong></p>
  <ul>
    <li>Top 10 Engaged Posts</li>
    <li>Lowest 10 Weighted Sentiment Posts</li>
    <li>Lowest 10 Raw Sentiment Posts</li>
    <li>Highest 10 Weighted Sentiment Posts</li>
    <li>Highest 10 Raw Sentiment Posts</li>
    <li>Top 10 Most Recent Posts</li>
  </ul>

  <h3>📝 3. Post Details Panel (Bottom)</h3>
  <p>Click any chart bar to populate this panel with:</p>
  <ul>
    <li>Title, author, and publish date</li>
    <li>Link to the original Reddit post</li>
    <li>AI-generated summary</li>
    <li>Badges: category, emotion, engagement, Reddit score, sentiment counts</li>
    <li>Post content</li>
    <li>All comments with metadata (author, emotion, score, sentiment)</li>
  </ul>

  <h3>📌 How Sentiment Works</h3>
  <ul>
    <li><strong>Raw Sentiment Score:</strong> Unweighted sentiment polarity.</li>
    <li><strong>Weighted Sentiment Score:</strong> Combines sentiment + popularity.</li>
    <li><strong>Engagement Score:</strong> Measures popularity (comments + upvotes).</li>
    <li><strong>Sentiment Labels:</strong> Positive, Negative, or Neutral based on analysis.</li>
  </ul>

  <h3>📉 Visual Cues & Color Legend</h3>
  <ul>
    <li>🟢 Green – Positive sentiment or comment</li>
    <li>🔴 Red – Negative sentiment or comment</li>
    <li>🟣 Purple – Comment/Engagement level</li>
    <li>🟡 Yellow – Neutral sentiment (in Pie Chart)</li>
  </ul>

  <h3>🛠️ Technical Stack</h3>
  <ul>
    <li><strong>Frontend:</strong> HTML5, CSS3, JavaScript</li>
    <li><strong>Charts:</strong> <a href="https://www.chartjs.org/" target="_blank">Chart.js</a></li>
    <li><strong>Database:</strong> Firebase Firestore</li>
    <li><strong>Sentiment Engine:</strong> Google Gemini API</li>
    <li><strong>Source Data:</strong> Reddit posts/comments from <a href="https://www.reddit.com/r/TemasekPoly/" target="_blank">r/TemasekPoly</a></li>
  </ul>

  <h3>⚠️ Disclaimer</h3>
  <p><strong>Note:</strong> Sentiment data is automatically generated using AI. Always refer to full post and comments for contextual accuracy.</p>
</section>



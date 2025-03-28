// --- Import only what you need from Firebase SDKs (Modular v9) ---
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-analytics.js';
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-firestore.js';

console.log("Script is loaded and running.");

const MAX_LABEL_LENGTH = 40;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Set default end date to today's date
  const endDateInput = document.getElementById('end-date');
  endDateInput.value = new Date().toISOString().split('T')[0];

  // 2. Firebase config
  const firebaseConfig = {
    apiKey: "AIzaSyByJtrvblZlThYxcL57BQReT3Tk48CjnBA",
    authDomain: "tpcraw-3ef8f.firebaseapp.com",
    projectId: "tpcraw-3ef8f",
    storageBucket: "tpcraw-3ef8f.firebasestorage.app",
    messagingSenderId: "576701097381",
    appId: "1:576701097381:web:50c9097f19e6dac9f8b44c",
    measurementId: "G-TQ3GW3ZQ6Z"
  };

  // 3. Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);

  // 4. Firestore instance
  const db = getFirestore(app);

  // 5. Chart references
  let weightedSentimentChart = null;
  let engagementScoreChart = null;
  let totalCommentsChart = null;

  // 6. Global array to store fetched posts
  let allPostsData = [];

  // ----------------------------
  // FETCH FIRESTORE POSTS
  // ----------------------------
  async function fetchPostsInRange() {
    console.log("fetchPostsInRange() called");

    const startDateValue = document.getElementById('start-date').value;
    const endDateValue = document.getElementById('end-date').value;

    // Get checkbox value
    const iitCheckbox = document.getElementById('iit-filter');
    const isIitChecked = iitCheckbox.checked;

    const startDate = new Date(startDateValue);
    const endDate = new Date(endDateValue);
    // Include the entire end date
    endDate.setHours(23, 59, 59, 999);

    // Build query to 'posts'
    let q = query(collection(db, 'posts'), orderBy('created', 'desc'));

    if (startDateValue) {
      q = query(q, where('created', '>=', startDate));
    }
    if (endDateValue) {
      q = query(q, where('created', '<=', endDate));
    }
    // Apply the IIT vs Poly filter
    if (isIitChecked) {
      // If checkbox is checked, show only iit == "yes"
      q = query(q, where('iit', '==', 'yes'));
      console.log("IIT option checked");
    }

    // Fetch posts
    const snapshot = await getDocs(q);
    console.log("Fetched posts, snapshot size:", snapshot.size);

    // Build the data array
    const dataArray = [];
    snapshot.forEach(postDoc => {
      const postData = postDoc.data();
      const postId = postDoc.id;
      const postTitle = postData.title || "No Title";

      // Weighted sentiment
      const weightedScore = postData.weightedSentimentScore || 0;

      // Engagement score
      const engagementScore = postData.engagementScore || 0;
      const totalComments = postData.totalComments || 0;

      const positiveData = postData.totalPositiveSentiments || 0;
      const negativeData = postData.totalNegativeSentiments || 0;

      // Raw sentiment (assumes a field 'rawSentimentScore' in each doc)
      const rawSentiment = postData.rawSentimentScore || 0;
      const category = postData.category || "";
      const emotion = postData.emotion || "";
      const summary = postData.summary || "";
      const iit = postData.iit || "";

      // Attempt to read 'created' as a JS Date (if it's a Firestore Timestamp)
      let createdDate = postData.created;
      if (createdDate && createdDate.toDate) {
        createdDate = createdDate.toDate();
      }

      dataArray.push({
        postId,
        title: postTitle,
        category: category,
        weightedSentimentScore: weightedScore,
        engagementScore: engagementScore,
        rawSentimentScore: rawSentiment,
        totalComments: totalComments,
        created: createdDate, // store as JS Date if possible
        totalPositiveSentiments: positiveData,
        totalNegativeSentiments: negativeData,
        emotion: emotion,
        summary: summary,
        iit: iit,
        postDetails: postData
      });
    });

    return dataArray;
  }

  // ----------------------------
  // CHART 1: WEIGHTED SENTIMENT
  // ----------------------------
  function renderWeightedSentimentChart(data) {
    const labels = data.map(post =>
      post.title.length > MAX_LABEL_LENGTH
        ? post.title.slice(0, MAX_LABEL_LENGTH) + '…'
        : post.title
    );
    const weightedScores = data.map(item => item.weightedSentimentScore);

    // Color each bar: red if negative, green if >= 0
    const backgroundColors = weightedScores.map(score =>
      score < 0
        ? 'rgba(255, 99, 132, 0.8)'  // red
        : 'rgba(75, 192, 192, 0.8)'  // green
    );

    // Destroy existing chart if it exists
    if (weightedSentimentChart) {
      weightedSentimentChart.destroy();
    }

    const ctx = document.getElementById('weightedSentimentChart').getContext('2d');
    weightedSentimentChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Weighted Sentiment Score',
          data: weightedScores,
          backgroundColor: backgroundColors
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Weighted Sentiment Breakdown by Post',
            align: 'start', // Left-align the title
            font: {
              size: 18,
              weight: '600',
              family: 'Arial, sans-serif' // Crisp, readable font
            },
            color: '#333', // Darker color for better contrast
            padding: {
              top: 10,
              bottom: 20
            }
          }
        },
        scales: {
          y: { beginAtZero: true }
        },
        onClick: (evt, elements) => {
          if (elements.length > 0) {
            const barIndex = elements[0].index;
            const item = data[barIndex];
            fetchAndDisplayPostDetails(item.postId);
          }
        }
      }
    });
  }

  // Function to fetch and display post details and comments
  async function fetchAndDisplayPostDetails(postId) {
    const postDetailsContainer = document.getElementById('post-details');

    // Fetch Post Document
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      postDetailsContainer.innerHTML = "<p>No details available for this post.</p>";
      return;
    }

    const postData = postSnap.data();

    // Exclude the body initially and prepare the analysis section
    let analysisHtml = `<h3>Post Title: ${postData.title}</h3><ul>`;

    const author = postData.author;
    const url = postData.URL;

    const date = postData.created.toDate ? postData.created.toDate() : new Date(postData.created);
    const formattedDate = date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(',', '');

    const dateHtml = `<li class="post-date">Author: ${author}, ${formattedDate}</li>`;
    const urlHtml = `<li class="post-date"><a href="${url}" target="_blank">${url}</a></li>`;

    const category = postData.category;
    const emotion = postData.emotion;
    const engagementScore = postData.engagementScore;
    const rawSentimentScore = postData.rawSentimentScore;
    const score = postData.score;
    const summary = postData.summary;
    const totalNegativeSentiments = postData.totalNegativeSentiments;
    const totalPositiveSentiments = postData.totalPositiveSentiments;
    const weightedSentimentScore = postData.weightedSentimentScore;

    const badgesHtml = `
    <div class="shields-container">
      <img src="https://img.shields.io/badge/category-${encodeURIComponent(postData.category)}-blue?style=flat-square" alt="Category">
      <img src="https://img.shields.io/badge/emotion-${encodeURIComponent(postData.emotion)}-purple?style=flat-square" alt="Emotion">
      <img src="https://img.shields.io/badge/engagement-${encodeURIComponent(engagementScore.toFixed(2))}-orange?style=flat-square" alt="Engagement">
      <img src="https://img.shields.io/badge/reddit_score-${encodeURIComponent(score)}-brightgreen?style=flat-square" alt="Reddit Score">
      <img src="https://img.shields.io/badge/positive_sentiments-${totalPositiveSentiments}-green?style=flat-square" alt="Positive">
      <img src="https://img.shields.io/badge/negative_sentiments-${encodeURIComponent(totalNegativeSentiments)}-red?style=flat-square" alt="Negative">
      <img src="https://img.shields.io/badge/weighted_sentiment-${encodeURIComponent(weightedSentimentScore.toFixed(2))}-blueviolet?style=flat-square" alt="Weighted">
    </div>,`;

    const postSummary = `<br><strong>Summary of the post using Gen AI</strong><br><p>${summary}</p>`;
    const postBodyHtml = `<p>${postData.body}</p>`;

    // Fetch comments
    const commentsRef = collection(db, `posts/${postId}/comments`);
    const commentsSnapshot = await getDocs(commentsRef);

    let commentsHtml = `<h3>Comments (${commentsSnapshot.size}):</h3>`;

    if (commentsSnapshot.size === 0) {
      commentsHtml += `<p>No comments available.</p>`;
    }
    else {
      commentsSnapshot.forEach(commentDoc => {
        const commentData = commentDoc.data();
        const commentDate = commentData.created.toDate ? commentData.created.toDate() : new Date(commentData.created);
        const formattedCommentDate = date.toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).replace(',', '');

        const sentiment = commentData.sentiment;
        let sentimentColor = 'orange'; // default for neutral

        if (sentiment < 0) {
          sentimentColor = 'red';
        } else if (sentiment > 0) {
          sentimentColor = 'green';
        }

        commentsHtml += `
          <div class="comment-card" style="border-bottom:1px solid #ddd;padding:10px;margin-bottom:10px;">
            <li class="post-date">Author: ${commentData.author}, ${formattedCommentDate}</li>

            <div class="shields-container">
              <img src="https://img.shields.io/badge/reddit_score-${encodeURIComponent(commentData.score)}-brightgreen?style=flat-square" alt="Reddit Score">
              <img src="https://img.shields.io/badge/sentiment-${encodeURIComponent(sentiment)}-${sentimentColor}?style=flat-square" alt="Sentiment">
              <img src="https://img.shields.io/badge/emotion-${encodeURIComponent(commentData.emotion)}-purple?style=flat-square" alt="Emotion">
            </div>,
            <p>${commentData.body}</p>
          </div>
        `;
      });
    }

    // Display the assembled HTML
    postDetailsContainer.innerHTML = analysisHtml
      + urlHtml
      + postSummary
      + badgesHtml
      + dateHtml
      + postBodyHtml
      + commentsHtml;
  }

  // Sentiment stack.
  function renderSentimentStackChart(data) {
    const labels = data.map(post =>
      post.title.length > MAX_LABEL_LENGTH
        ? post.title.slice(0, MAX_LABEL_LENGTH) + '…'
        : post.title
    );
    const positiveData = data.map(post => post.totalPositiveSentiments);
    const negativeData = data.map(post => post.totalNegativeSentiments);

    const ctx = document.getElementById('stackedSentimentChart').getContext('2d');

    if (window.sentimentStackChartInstance) {
      window.sentimentStackChartInstance.destroy();
    }

    window.sentimentStackChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Positive Sentiments',
            data: positiveData,
            backgroundColor: 'rgba(75, 192, 192, 0.8)', // Green
            stack: 'Stack 0'
          },
          {
            label: 'Negative Sentiments',
            data: negativeData,
            backgroundColor: 'rgba(255, 99, 132, 0.8)', // Red
            stack: 'Stack 0'
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Sentiment Breakdown by Post',
            align: 'start',
            font: {
              size: 18,
              weight: '600',
              family: 'Arial, sans-serif'
            },
            color: '#333',
            padding: {
              top: 10,
              bottom: 20
            }
          }
        },
        scales: {
          x: {
            stacked: true
          },
          y: {
            stacked: true,
            beginAtZero: true
          }
        },
        onClick: (evt, elements) => {
          if (elements.length > 0) {
            const barIndex = elements[0].index;
            const item = data[barIndex];
            fetchAndDisplayPostDetails(item.postId);
          }
        }
      }
    });
  }

  // ----------------------------
  // CHART 2: ENGAGEMENT SCORE
  // ----------------------------
  function renderEngagementScoreChart(data) {
    console.log("Rendering Engagement Score Chart with data:", data);

    const labels = data.map(post =>
      post.title.length > MAX_LABEL_LENGTH
        ? post.title.slice(0, MAX_LABEL_LENGTH) + '…'
        : post.title
    );
    const engagementScores = data.map(item => item.engagementScore);

    const backgroundColors = engagementScores.map(() => 'rgba(153, 102, 255, 0.8)');

    if (engagementScoreChart) {
      engagementScoreChart.destroy();
    }

    const ctx = document.getElementById('engagementScoreChart').getContext('2d');
    engagementScoreChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Engagement Score',
          data: engagementScores,
          backgroundColor: backgroundColors
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Engagement Score per Post',
            align: 'start',
            font: {
              size: 18,
              weight: '600',
              family: 'Arial, sans-serif'
            },
            color: '#333',
            padding: {
              top: 10,
              bottom: 20
            }
          }
        },
        scales: {
          y: { beginAtZero: true }
        },
        onClick: (evt, elements) => {
          if (elements.length > 0) {
            const barIndex = elements[0].index;
            const item = data[barIndex];
            fetchAndDisplayPostDetails(item.postId);
          }
        }
      }
    });
  }

  // ----------------------------
  // CHART 2: TOTAL COMMENTS
  // ----------------------------
  function renderCommentsCountChart(data) {
    const labels = data.map(post =>
      post.title.length > MAX_LABEL_LENGTH
        ? post.title.slice(0, MAX_LABEL_LENGTH) + '…'
        : post.title
    );
    const totalComments = data.map(item => item.totalComments);

    const backgroundColors = totalComments.map(() => 'rgba(153, 102, 255, 0.8)');

    if (totalCommentsChart) {
      totalCommentsChart.destroy();
    }

    const ctx = document.getElementById('totalCommentsChart').getContext('2d');
    totalCommentsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Total Comments',
          data: totalComments,
          backgroundColor: backgroundColors
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Comments per Post',
            align: 'start',
            font: {
              size: 18,
              weight: '600',
              family: 'Arial, sans-serif'
            },
            color: '#333',
            padding: {
              top: 10,
              bottom: 20
            }
          }
        },
        scales: {
          y: { beginAtZero: true }
        },
        onClick: (evt, elements) => {
          if (elements.length > 0) {
            const barIndex = elements[0].index;
            const item = data[barIndex];
            fetchAndDisplayPostDetails(item.postId);
          }
        }
      }
    });
  }

  // ----------------------------
  // POST LIST DROPDOWN / TABLE
  // ----------------------------
  const postListDropdown = document.getElementById('postListDropdown');
  postListDropdown.addEventListener('change', () => {
    renderPostList(allPostsData, postListDropdown.value);
  });

  function renderPostList(data, listType) {
    console.log("Rendering post list:", listType);

    let selectedPosts = [...data]; // shallow copy

    switch (listType) {
      case 'topEngaged':
        selectedPosts.sort((a, b) => b.engagementScore - a.engagementScore);
        selectedPosts = selectedPosts.slice(0, 10);
        break;
      case 'lowestWs':
        selectedPosts.sort((a, b) => a.weightedSentimentScore - b.weightedSentimentScore);
        selectedPosts = selectedPosts.slice(0, 10);
        break;
      case 'lowestRaw':
        selectedPosts.sort((a, b) => a.rawSentimentScore - b.rawSentimentScore);
        selectedPosts = selectedPosts.slice(0, 10);
        break;
      case 'highestWs':
        selectedPosts.sort((a, b) => b.weightedSentimentScore - a.weightedSentimentScore);
        selectedPosts = selectedPosts.slice(0, 10);
        break;
      case 'highestRaw':
        selectedPosts.sort((a, b) => b.rawSentimentScore - a.rawSentimentScore);
        selectedPosts = selectedPosts.slice(0, 10);
        break;
      case 'recentPosts':
        selectedPosts.sort((a, b) => new Date(b.created) - new Date(a.created));
        selectedPosts = selectedPosts.slice(0, 10);
        break;
      default:
        selectedPosts = [];
        break;
    }

    const tableHtml = buildPostsTable(selectedPosts);
    const container = document.getElementById('postListContainer');
    container.innerHTML = tableHtml;

    // Make each row clickable:
    container.querySelectorAll('tr[data-post-id]').forEach(row => {
      row.addEventListener('click', () => {
        // NEW: remove 'selected' from any previously clicked row
        container.querySelectorAll('tr.selected').forEach(sel => sel.classList.remove('selected'));
  
        // NEW: add 'selected' to the clicked row
        row.classList.add('selected');
  
        // existing call
        const postId = row.getAttribute('data-post-id');
        fetchAndDisplayPostDetails(postId);
      });
    });
  }

  function buildPostsTable(posts) {
    let html = `
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Weighted Score</th>
            <th>Engagement Score</th>
            <th>Raw Sentiment</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const p of posts) {
      // Add data-post-id and cursor style for row-click
      html += `
        <tr data-post-id="${p.postId}" style="cursor: pointer;">
          <td>${p.title}</td>
          <td>${p.weightedSentimentScore.toFixed(2)}</td>
          <td>${p.engagementScore.toFixed(2)}</td>
          <td>${p.rawSentimentScore.toFixed(2)}</td>
        </tr>
      `;
    }
    html += `</tbody></table>`;
    return html;
  }

  // Calculate positive, neutral, negative sentiment percentages and render pie chart
  function renderSentimentPieChart(data) {
    const totalPosts = data.length;
    if (totalPosts === 0) {
      const ctx = document.getElementById('sentimentPieChart').getContext('2d');
      if (window.sentimentPieChartInstance) {
        window.sentimentPieChartInstance.destroy();
      }
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      return;
    }

    const positiveCount = data.filter(p => p.weightedSentimentScore > 0).length;
    const neutralCount = data.filter(p => p.weightedSentimentScore === 0).length;
    const negativeCount = data.filter(p => p.weightedSentimentScore < 0).length;

    const positivePercent = ((positiveCount / totalPosts) * 100).toFixed(1);
    const neutralPercent = ((neutralCount / totalPosts) * 100).toFixed(1);
    const negativePercent = ((negativeCount / totalPosts) * 100).toFixed(1);

    const ctx = document.getElementById('sentimentPieChart').getContext('2d');

    if (window.sentimentPieChartInstance) {
      window.sentimentPieChartInstance.destroy();
    }

    ctx.canvas.width = 260;
    ctx.canvas.height = 260;

    window.sentimentPieChartInstance = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Positive', 'Neutral', 'Negative'],
        datasets: [{
          data: [positivePercent, neutralPercent, negativePercent],
          backgroundColor: ['#4CAF50', '#FFC107', '#F44336'],
        }]
      },
      options: {
        responsive: false,
        plugins: {
          legend: {
            display: false,
            position: 'left'
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.label}: ${context.raw}%`
            }
          }
        }
      }
    });
  }

  async function updateCharts() {
    try {
      allPostsData = await fetchPostsInRange();

      document.querySelector("#postCount .postCount-number").textContent = allPostsData.length;

      if (allPostsData.length > 0) {
        const sum = allPostsData.reduce((acc, post) => acc + post.weightedSentimentScore, 0);
        const avg = sum / allPostsData.length;
        document.getElementById("avgWeightedScoreNumber").textContent = avg.toFixed(2);

        const totalComments = allPostsData.reduce((acc, post) => acc + post.totalComments, 0);
        document.getElementById("commentsCountNumber").textContent = totalComments;
      } else {
        document.getElementById("avgWeightedScoreNumber").textContent = "N/A";
        document.getElementById("commentsCountNumber").textContent = "0";
      }

      renderSentimentPieChart(allPostsData);
      renderEngagementScoreChart(allPostsData);
      renderCommentsCountChart(allPostsData);

      // Default: show "Lowest 10 Raw Sentiment Posts"
      postListDropdown.value = 'lowestRaw';
      renderPostList(allPostsData, 'lowestRaw');

      // Re-render the currently active chart
      const activeTabId = document.querySelector('.tab-button.active').getAttribute('data-tab');
      if (activeTabId === 'weightedTab') {
        renderWeightedSentimentChart(allPostsData);
      } else if (activeTabId === 'stackedTab') {
        renderSentimentStackChart(allPostsData);
      } else if (activeTabId === 'engagementTab') {
        renderEngagementScoreChart(allPostsData);
      } else if (activeTabId === 'totalCommentsTab') {
        renderCommentsCountChart(allPostsData);
      }

    } catch (error) {
      console.error("Error building charts:", error);
    }
  }

  // 10. Filter button event
  document.getElementById('filter-btn').addEventListener('click', updateCharts);

  // 11. Initial load
  updateCharts();

  // Handle tab switching logic
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');

      // Reset active states for buttons
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));

      // Reset active states for tabs
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none';
      });

      // Activate clicked tab button and tab content
      button.classList.add('active');
      const activeTab = document.getElementById(tabId);
      activeTab.classList.add('active');
      activeTab.style.display = 'block';

      // Explicitly re-render charts when the tab is activated
      if (tabId === 'stackedTab') {
        renderSentimentStackChart(allPostsData);
      } else if (tabId === 'weightedTab') {
        renderWeightedSentimentChart(allPostsData);
      } else if (tabId === 'engagementTab') {
        renderEngagementScoreChart(allPostsData);
      } else if (tabId === 'totalCommentsTab') {
        renderCommentsCountChart(allPostsData);
      }
    });
  });

  // Set default active tab on load
  document.querySelector('.tab-button.active').click();
});

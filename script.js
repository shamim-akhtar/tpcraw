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

const MAX_LABEL_LENGTH = 30;

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
  let commentsSentimentChart = null;

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
  // CHART 1: SENTIMENT DISTRIBUTION PIE CHART.
  // ----------------------------
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

  // ----------------------------
  // CHART 2: WEIGHTED SENTIMENT
  // ----------------------------
  function renderWeightedSentimentChart(data) {
    const labels = data.map(post => {
      const { title } = post;
      if (title.length > MAX_LABEL_LENGTH) {
        // If title exceeds the limit, truncate and add ellipsis
        return title.slice(0, MAX_LABEL_LENGTH) + '…';
      } else {
        // Otherwise, pad the left side with spaces until it reaches the desired length
        return title.padStart(MAX_LABEL_LENGTH, ' ');
      }
    });
    
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
          },
          
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: 'ctrl',
            },
            zoom: {
              drag: {
                enabled: true, 
              },
              pinch: {
                enabled: true,
              },
              mode: 'x',
            },
          }
        },
        scales: {
          x: {
            
            ticks: {
              // Prevent tilt / rotation
              maxRotation: 60,
              minRotation: 60,
              // Optional: center align each label
              align: 'center'
            }
          },
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
  // CHART 3: RAW SENTIMENT STACK
  // ----------------------------
  function renderSentimentStackChart(data) {
    const labels = data.map(post => {
      const { title } = post;
      if (title.length > MAX_LABEL_LENGTH) {
        // If title exceeds the limit, truncate and add ellipsis
        return title.slice(0, MAX_LABEL_LENGTH) + '…';
      } else {
        // Otherwise, pad the left side with spaces until it reaches the desired length
        return title.padStart(MAX_LABEL_LENGTH, ' ');
      }
    });
    const positiveData = data.map(post => post.totalPositiveSentiments);
    const negativeData = data.map(post => post.totalNegativeSentiments);

    const ctx = document.getElementById('stackedSentimentChart').getContext('2d');

    if (commentsSentimentChart) {
      commentsSentimentChart.destroy();
    }

    commentsSentimentChart = new Chart(ctx, {
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
          },
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: 'ctrl',
            },
            zoom: {
              drag: {
                enabled: true, 
              },
              pinch: {
                enabled: true,
              },
              mode: 'x',
            },
          }
        },
        scales: {
          x: {
            stacked: true,
              
            ticks: {
              // Prevent tilt / rotation
              maxRotation: 60,
              minRotation: 60,
              // Optional: center align each label
              align: 'center'
            },
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
  // CHART 4: ENGAGEMENT SCORE
  // ----------------------------
  function renderEngagementScoreChart(data) {
    const labels = data.map(post => {
      const { title } = post;
      if (title.length > MAX_LABEL_LENGTH) {
        // If title exceeds the limit, truncate and add ellipsis
        return title.slice(0, MAX_LABEL_LENGTH) + '…';
      } else {
        // Otherwise, pad the left side with spaces until it reaches the desired length
        return title.padStart(MAX_LABEL_LENGTH, ' ');
      }
    });
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
          },
          
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: 'ctrl',
            },
            zoom: {
              drag: {
                enabled: true, 
              },
              pinch: {
                enabled: true,
              },
              mode: 'x',
            },
          }
        },
        scales: {
          x: {
            
            ticks: {
              // Prevent tilt / rotation
              maxRotation: 60,
              minRotation: 60,
              // Optional: center align each label
              align: 'center'
            }
          },
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
  // CHART 5: TOTAL COMMENTS
  // ----------------------------
  function renderCommentsCountChart(data) {
    const labels = data.map(post => {
      const { title } = post;
      if (title.length > MAX_LABEL_LENGTH) {
        // If title exceeds the limit, truncate and add ellipsis
        return title.slice(0, MAX_LABEL_LENGTH) + '…';
      } else {
        // Otherwise, pad the left side with spaces until it reaches the desired length
        return title.padStart(MAX_LABEL_LENGTH, ' ');
      }
    });
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
          },
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: 'ctrl',
            },
            zoom: {
              drag: {
                enabled: true, 
              },
              pinch: {
                enabled: true,
              },
              mode: 'x',
            },
          }
        },
        scales: {
          x: {
            
            ticks: {
              // Prevent tilt / rotation
              maxRotation: 60,
              minRotation: 60,
              // Optional: center align each label
              align: 'center'
            }
          },
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
  // 6: FETCH POST DETAILS
  // ----------------------------
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

  // ----------------------------
  // 7. POST LIST DROPDOWN / TABLE
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

  // New function to fetch authors from Firestore
  async function fetchAuthorStats() {
    const authorsSnapshot = await getDocs(collection(db, 'authors'));
    let authorArray = [];
    authorsSnapshot.forEach(doc => {
      const data = doc.data();
      data.author = doc.id; // use the document ID as the author name
      authorArray.push(data);
    });
    // Sort by negativeCount descending.
    authorArray.sort((a, b) => b.negativeCount - a.negativeCount);

    // Return top 10 negative authors
    return authorArray.slice(0, 10);
  }

  // New function to render the authors stacked bar chart
  function renderAuthorsChart(data) {
    const labels = data.map(item => item.author);
    const positiveCounts = data.map(item => item.positiveCount);
    const negativeCounts = data.map(item => item.negativeCount);

    if (window.authorsChartInstance) {
      window.authorsChartInstance.destroy();
    }

    const ctx = document.getElementById('authorsChart').getContext('2d');
    window.authorsChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Positive Count',
            data: positiveCounts,
            backgroundColor: 'rgba(75, 192, 192, 0.8)', // green
          },
          {
            label: 'Negative Count',
            data: negativeCounts,
            backgroundColor: 'rgba(255, 99, 132, 0.8)', // red
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Top 10 Authors with Most Negative Sentiments',
            align: 'start',
            font: {
              size: 18,
              weight: '600',
              family: 'Arial, sans-serif'
            },
            color: '#333',
            padding: { top: 10, bottom: 20 }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.raw}`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            ticks: {
              maxRotation: 60,
              minRotation: 60,
              align: 'center'
            }
          },
          y: {
            stacked: true,
            beginAtZero: true
          }
        },
        onClick: (evt, elements) => {
          if (elements.length > 0) {
            const authorName = labels[elements[0].index];
            alert(`Author: ${authorName}`);
          }
        }
      }
    });
  }


  // New function to update the authors chart
  async function updateAuthorsChart() {
    try {
      const authorData = await fetchAuthorStats();
      renderAuthorsChart(authorData);
    } catch (error) {
      console.error("Error updating authors chart:", error);
    }
  }

  // Utility function: generate a random color for chart lines
  function getRandomColor() {
    const r = Math.floor(Math.random() * 200);
    const g = Math.floor(Math.random() * 200);
    const b = Math.floor(Math.random() * 200);
    return `rgba(${r}, ${g}, ${b}, 1)`;
  }
  const PREDEFINED_CATEGORY_COLORS = {
    academic: "#0070F2", 
    exams: "#A93E00",
    internship: "#5DC122",
    facilities: "#BA066C",
    subjects: "#256F3A",
    administration: "#8B47D7",
    career: "#798C77",
    admission: "#AA0808",
    results: "#470CED",
    lecturer: "#DA6C6C",
    "student life": "#049F9A",
    infrastructure: "#4DB6AC",
    classroom: "#354A5F",
    events: "#00BCD4",
    cca: "#7800A4"
  };
  
  function getCategoryColor(category) {
    const key = category.toLowerCase();
    return PREDEFINED_CATEGORY_COLORS[key] || "#26C6DA"; // default cool cyan
  }
  

  // Fetch time series data from Firestore's "category_stats" collection.
  // Each document key is a date (YYYY-MM-DD) and contains maps for each category.
  async function fetchTimeSeriesData() {
    // Read the filter dates
    const startDateValue = document.getElementById('start-date').value;
    const endDateValue = document.getElementById('end-date').value;
    const startDate = new Date(startDateValue);
    const endDate = new Date(endDateValue);
    // Include the entire end date
    endDate.setHours(23, 59, 59, 999);
  
    const catStatsSnapshot = await getDocs(collection(db, 'category_stats'));
    let timeSeriesData = {}; // { category: [ {x: date, y: averageSentiment}, ... ] }
    
    catStatsSnapshot.forEach(docSnap => {
      const dateStr = docSnap.id; // document ID in YYYY-MM-DD format
      const docDate = new Date(dateStr);
      // Filter only those documents that fall within the selected date range
      if (docDate >= startDate && docDate <= endDate) {
        const data = docSnap.data();
        for (let category in data) {
          if (!timeSeriesData[category]) {
            timeSeriesData[category] = [];
          }
          timeSeriesData[category].push({
            x: dateStr,
            y: data[category].averageSentiment || 0
          });
        }
      }
    });
    
    // Sort each category's data array by date
    for (let category in timeSeriesData) {
      timeSeriesData[category].sort((a, b) => new Date(a.x) - new Date(b.x));
    }
    
    return timeSeriesData;
  }

  // Helper function: compute a moving average (default window = 7 days)
  function computeMovingAverage(dataPoints, windowSize = 7) {
    let maPoints = [];
    for (let i = 0; i < dataPoints.length; i++) {
      let start = Math.max(0, i - windowSize + 1);
      let sum = 0;
      let count = 0;
      for (let j = start; j <= i; j++) {
        sum += dataPoints[j].y;
        count++;
      }
      let avg = sum / count;
      maPoints.push({ x: dataPoints[i].x, y: avg });
    }
    return maPoints;
  }

  // Helper function to set the alpha value of an RGBA color string.
  function setAlpha(rgba, alpha) {
    // Assumes the input is in the format "rgba(r, g, b, 1)"
    return rgba.replace(/, 1\)/, `, ${alpha})`);
  }

  // Updated renderTimeSeriesChart: show raw data in a light color and the 7-day MA in a solid line.
  // Also, only the academic category is visible by default.
  function renderTimeSeriesChart(data) {
    let datasets = [];
    for (let category in data) {
      const color = getCategoryColor(category);//getRandomColor();
      
      // Raw data dataset in a light/transparent color
      datasets.push({
        label: category + " (raw)",
        data: data[category],
        fill: false,
        borderColor: setAlpha(color, 0.3), // transparent version
        tension: 0.1,
        borderWidth: 0.5,
        hidden: (category.toLowerCase() !== 'academic')
      });
      
      // 7-day moving average dataset in solid color
      datasets.push({
        label: category + " (7-day MA)",
        data: computeMovingAverage(data[category], 7),
        fill: false,
        borderColor: color, // solid line
        borderWidth: 2.0,
        tension: 0.5,
        hidden: (category.toLowerCase() !== 'academic')
      });
    }
    
    if (window.timeSeriesChartInstance) {
      window.timeSeriesChartInstance.destroy();
    }
    
    const ctx = document.getElementById('timeSeriesChart').getContext('2d');
    window.timeSeriesChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: datasets
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Time Series of Average Sentiment by Category',
            align: 'start',
            font: {
              size: 18,
              weight: '600'
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
          },
          legend: {
            labels: {
              generateLabels: function(chart) {
                const datasets = chart.data.datasets;
                const seenCategories = {};
                const labels = [];
                datasets.forEach((dataset, i) => {
                  // Expect label format "academic (raw)" or "academic (7-day MA)"
                  const cat = dataset.label.split(" ")[0];
                  if (seenCategories[cat] === undefined) {
                    seenCategories[cat] = i;
                    labels.push({
                      text: cat,
                      fillStyle: dataset.borderColor,
                      hidden: !chart.isDatasetVisible(i),
                      datasetIndex: i
                    });
                  }
                });
                // Sort labels alphabetically in ascending order
                labels.sort((a, b) => a.text.localeCompare(b.text));
                return labels;
              }
            },
            onClick: function(e, legendItem, legend) {
              const category = legendItem.text.toLowerCase();
              const chart = legend.chart;
              chart.data.datasets.forEach((dataset, i) => {
                const dsCategory = dataset.label.split(" ")[0].toLowerCase();
                if (dsCategory === category) {
                  const meta = chart.getDatasetMeta(i);
                  meta.hidden = meta.hidden === null ? !chart.data.datasets[i].hidden : !meta.hidden;
                }
              });
              chart.update();
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              parser: 'yyyy-MM-dd', // note lowercase 'yyyy'
              unit: 'day',
              displayFormats: {
                day: 'MMM d'
              }
            },
            title: {
              display: true,
              text: 'Date'
            }
          },
          y: {
            min: -1.2,
            max: 1.2,
            beginAtZero: false,
            title: {
              display: true,
              text: 'Average Sentiment'
            }
          }
        },
        onClick: async (evt, elements) => { // New onClick event for clicking on data points
          if (elements.length > 0) {
              const element = elements[0];
              const datasetIndex = element.datasetIndex;
              const index = element.index;
              const dataset = window.timeSeriesChartInstance.data.datasets[datasetIndex];
              
              // Extract category from the dataset label
              const categoryLabel = dataset.label.split(" ")[0]; // e.g., "academic (raw)" becomes "academic"
              const category = categoryLabel.toLowerCase(); // Normalizing to lowercase for consistency

              // Get the clicked point's date
              const dataPoint = dataset.data[index];
              const dateStr = dataPoint.x; // Should be formatted as "YYYY-MM-DD"

              console.log(`Clicked on Category: ${category}, Date: ${dateStr}`);

              // Call the function to fetch and display relevant posts and comments
              await fetchAndDisplayPostsByCategoryAndDate(category, dateStr);
          }
        }
      }
    });
  }  

  // Update the time series chart by fetching the latest data and rendering the chart.
  async function updateTimeSeriesChart() {
    try {
      const tsData = await fetchTimeSeriesData();
      renderTimeSeriesChart(tsData);
    } catch (error) {
      console.error("Error updating time series chart:", error);
    }
  }

  async function fetchAndDisplayPostsByCategoryAndDate(category, dateStr) {
    // Get the container where posts and comments will be rendered.
    const container = document.getElementById('post-details');
    container.innerHTML = `<p>Loading posts and comments for ${category} on ${dateStr}...</p>`;
  
    // Fetch the category_stats document for the given date.
    const statsDocRef = doc(db, 'category_stats', dateStr);
    const statsDocSnap = await getDoc(statsDocRef);
  
    if (!statsDocSnap.exists()) {
      container.innerHTML = `<p>No data found for ${category} on ${dateStr}.</p>`;
      return;
    }
  
    const statsData = statsDocSnap.data();
    if (!statsData[category]) {
      container.innerHTML = `<p>No posts or comments found for ${category} on ${dateStr}.</p>`;
      return;
    }
  
    const postIds = statsData[category].postIds || [];
    // Expected structure for comments: { postId: [commentId1, commentId2, ...] }
    const commentsMap = statsData[category].comments || {};
  
    // Build the HTML for posts.
    let html = `<h3>Posts for ${category} on ${dateStr}:</h3>`;
    for (const postId of postIds) {
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);
      if (postSnap.exists()) {
        const postData = postSnap.data();
        html += `<div class="post-summary" style="border:1px solid #ccc; padding:10px; margin-bottom:10px;">
                   <h4>${postData.title}</h4>
                   <p>${postData.body}</p>
                 </div>`;
      }
    }
  
    // Build the HTML for comments.
    html += `<h3>Comments for ${category} on ${dateStr}:</h3>`;
    // Loop through each postId in the comments map.
    for (const postId in commentsMap) {
      const commentIds = commentsMap[postId];
      for (const commentId of commentIds) {
        const commentRef = doc(db, `posts/${postId}/comments`, commentId);
        const commentSnap = await getDoc(commentRef);
        if (commentSnap.exists()) {
          const commentData = commentSnap.data();
          html += `<div class="comment-card" style="border:1px solid #ddd; padding:10px; margin-bottom:10px;">
                     <p><strong>${commentData.author}:</strong> ${commentData.body}</p>
                   </div>`;
        }
      }
    }
  
    // Inject the complete HTML into the container.
    container.innerHTML = html;
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

      renderWeightedSentimentChart(allPostsData);
      renderSentimentStackChart(allPostsData);
      renderEngagementScoreChart(allPostsData);
      renderCommentsCountChart(allPostsData);

      
      const tsData = await fetchTimeSeriesData();
      renderTimeSeriesChart(tsData);
      

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
      } else if (activeTabId === 'timeSeriesTab') {
        renderTimeSeriesChart(tsData);
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
      } else if (tabId === 'authorsTab') {
        updateAuthorsChart();
      } else if (tabId === 'timeSeriesTab') {
        updateTimeSeriesChart();
      }
    });
  });

  // Set default active tab on load
  document.querySelector('.tab-button.active').click();
  
  document.getElementById('resetZoomWeightedBtn').addEventListener('click', () => {
    if (weightedSentimentChart) weightedSentimentChart.resetZoom();
  });
  
  document.getElementById('resetZoomStackedBtn').addEventListener('click', () => {
    if (commentsSentimentChart) commentsSentimentChart.resetZoom();
  });
  
  document.getElementById('resetZoomCommentsBtn').addEventListener('click', () => {
    if (totalCommentsChart) totalCommentsChart.resetZoom();
  });
  
  document.getElementById('resetZoomEngagementBtn').addEventListener('click', () => {
    if (engagementScoreChart) engagementScoreChart.resetZoom();
  }); 
  
});

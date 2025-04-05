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

  // 7. Get references to new search elements
  const keywordInput = document.getElementById('keyword-search');
  const searchButton = document.getElementById('search-btn');
  const postDetailsContainer = document.getElementById('post-details'); // Reference to the display area
  
  const tabs = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  const tabContainer = document.querySelector('.tab-container'); // Parent for event delegation

  // Function to switch tabs
  function switchTab(event) {
      // Check if the clicked element is a tab button
      if (!event.target.classList.contains('tab-button')) return;

      const targetTab = event.target.dataset.tab;

      // Update button styles
      tabs.forEach(button => {
          button.classList.remove('active');
          button.style.borderBottom = '3px solid transparent'; // Reset border
          button.style.fontWeight = 'normal'; // Reset font weight
      });
      event.target.classList.add('active');
      event.target.style.borderBottom = '3px solid #4CAF50'; // Highlight active tab
      event.target.style.fontWeight = '500'; // Make active tab bold

      // Hide all content sections
      tabContents.forEach(content => {
          content.style.display = 'none';
          content.classList.remove('active');
      });

      // Show the target content section
      const activeContent = document.getElementById(targetTab);
      if (activeContent) {
          activeContent.style.display = 'block';
          activeContent.classList.add('active');
          
          // Re-initialize or update charts if necessary when tab becomes visible
          // Example: if (window.myCharts && window.myCharts[targetTab]) {
          //     window.myCharts[targetTab].resize(); 
          //     window.myCharts[targetTab].update(); 
          // }
      }
  }

  // --------------------------------------------------------------
  // Add event listener to the container
  if (tabContainer) {
      tabContainer.addEventListener('click', switchTab);
  }

  // Initial setup: Ensure the default active tab's content is visible
  const initiallyActiveButton = document.querySelector('.tab-button.active');
  if (initiallyActiveButton) {
      const initialTabId = initiallyActiveButton.dataset.tab;
      const initialContent = document.getElementById(initialTabId);
      if (initialContent) {
          initialContent.style.display = 'block';
      }
  }
  
  // Add basic hover effect via JS if needed (alternative to CSS :hover)
  tabs.forEach(tab => {
      tab.addEventListener('mouseover', () => {
          if (!tab.classList.contains('active')) {
              tab.style.color = '#007BFF'; // Example hover color
          }
      });
      tab.addEventListener('mouseout', () => {
           if (!tab.classList.contains('active')) {
              tab.style.color = '#333'; // Restore original color
          }
      });
  });

  // Example: Add hover effect to reset zoom buttons
  const resetButtons = document.querySelectorAll('[id^="resetZoom"]');
  resetButtons.forEach(button => {
       button.addEventListener('mouseover', () => {
           button.style.filter = 'brightness(90%)';
       });
       button.addEventListener('mouseout', () => {
           button.style.filter = 'brightness(100%)';
       });
  });
  // --------------------------------------------------------------

  // --------------------------------------------------------------
  // FETCH FIRESTORE POSTS - with filters for subreddit & checkboxes
  // --------------------------------------------------------------
  async function fetchPostsInRange() {
    console.log("fetchPostsInRange() called");

    const startDateValue = document.getElementById('start-date').value;
    const endDateValue = document.getElementById('end-date').value;

    // Checkboxes
    const iitCheckbox = document.getElementById('iit-filter');
    const isIitChecked = iitCheckbox.checked;

    const tpRelatedCheckbox = document.getElementById('tp-related-filter');
    const isTpRelatedChecked = tpRelatedCheckbox.checked;

    // Get the selected subreddit
    const subredditSelect = document.getElementById('subreddit-select');
    const selectedSubreddit = subredditSelect.value;
    const lowerSub = selectedSubreddit.toLowerCase();

    // For TemasekPoly, the collection is "posts", else "{lowerSub}_posts"
    const postsCollection = (lowerSub === "temasekpoly") 
      ? "posts"
      : `${lowerSub}_posts`;

    console.log("Selected subreddit:", selectedSubreddit);
    console.log("Using posts collection:", postsCollection);

    const startDate = new Date(startDateValue);
    const endDate = new Date(endDateValue);
    // Include the entire end date
    endDate.setHours(23, 59, 59, 999);

    // Build initial query on the posts collection
    let q = query(collection(db, postsCollection), orderBy('created', 'desc'));

    // Apply date range filters
    if (startDateValue) {
      q = query(q, where('created', '>=', startDate));
    }
    if (endDateValue) {
      q = query(q, where('created', '<=', endDate));
    }

    // If the subreddit is TemasekPoly, use the "iit" filter if checked
    if (lowerSub === "temasekpoly") {
      if (isIitChecked) {
        q = query(q, where('iit', '==', 'yes'));
        console.log("IIT filter applied: iit == yes");
      }
    }
    // Otherwise, for non-TemasekPoly subreddits, use the "relatedToTemasekPoly" filter if checked
    else {
      if (isTpRelatedChecked) {
        q = query(q, where('relatedToTemasekPoly', '==', true));
        console.log("TP-related filter applied: relatedToTemasekPoly == true");
      }
    }

    // Now fetch posts
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
      const engagementScore = postData.engagementScore ?? 0;
      const totalComments = postData.totalComments || 0;

      const positiveData = postData.totalPositiveSentiments || 0;
      const negativeData = postData.totalNegativeSentiments || 0;

      // Raw sentiment
      const rawSentiment = postData.rawSentimentScore || 0;
      const category = postData.category || "";
      const emotion = postData.emotion || "";
      const summary = postData.summary || "";
      const iit = postData.iit || "";

      // Convert Firestore Timestamp to JS Date if applicable
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
        created: createdDate,
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

  // ---------------------------------------------
  // Chart 1: SENTIMENT DISTRIBUTION PIE CHART
  // ---------------------------------------------
  function renderSentimentPieChart(data) {
    const totalPosts = data.length;
    const ctx = document.getElementById('sentimentPieChart').getContext('2d');

    // If no data, destroy or clear existing chart
    if (totalPosts === 0) {
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

  // ---------------------------------------------
  // Chart 2: WEIGHTED SENTIMENT
  // ---------------------------------------------
  function renderWeightedSentimentChart(data) {
    const labels = data.map(post => {
      const { title } = post;
      if (title.length > MAX_LABEL_LENGTH) {
        return title.slice(0, MAX_LABEL_LENGTH) + '…';
      } else {
        return title.padStart(MAX_LABEL_LENGTH, ' ');
      }
    });
    const weightedScores = data.map(item => item.weightedSentimentScore);

    // Bar color: red if negative, green if >= 0
    const backgroundColors = weightedScores.map(score =>
      score < 0 ? 'rgba(255, 99, 132, 0.8)' : 'rgba(75, 192, 192, 0.8)'
    );

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
            align: 'start',
            font: { size: 18, weight: '600', family: 'Arial, sans-serif' },
            color: '#333',
            padding: { top: 10, bottom: 20 }
          },
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: 'ctrl',
            },
            zoom: {
              drag: { enabled: true },
              pinch: { enabled: true },
              mode: 'x',
            },
          }
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 60,
              minRotation: 60,
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

  // ---------------------------------------------
  // Chart 3: RAW SENTIMENT STACK
  // ---------------------------------------------
  function renderSentimentStackChart(data) {
    const labels = data.map(post => {
      const { title } = post;
      if (title.length > MAX_LABEL_LENGTH) {
        return title.slice(0, MAX_LABEL_LENGTH) + '…';
      } else {
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
            backgroundColor: 'rgba(75, 192, 192, 0.8)',
            stack: 'Stack 0'
          },
          {
            label: 'Negative Sentiments',
            data: negativeData,
            backgroundColor: 'rgba(255, 99, 132, 0.8)',
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
            font: { size: 18, weight: '600', family: 'Arial, sans-serif' },
            color: '#333',
            padding: { top: 10, bottom: 20 }
          },
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: 'ctrl',
            },
            zoom: {
              drag: { enabled: true },
              pinch: { enabled: true },
              mode: 'x',
            },
          }
        },
        scales: {
          x: {
            stacked: true,
            ticks: {
              maxRotation: 60,
              minRotation: 60,
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

  // ---------------------------------------------
  // Chart 4: ENGAGEMENT SCORE
  // ---------------------------------------------
  function renderEngagementScoreChart(data) {
    const labels = data.map(post => {
      const { title } = post;
      if (title.length > MAX_LABEL_LENGTH) {
        return title.slice(0, MAX_LABEL_LENGTH) + '…';
      } else {
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
            font: { size: 18, weight: '600', family: 'Arial, sans-serif' },
            color: '#333',
            padding: { top: 10, bottom: 20 }
          },
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: 'ctrl',
            },
            zoom: {
              drag: { enabled: true },
              pinch: { enabled: true },
              mode: 'x',
            },
          }
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 60,
              minRotation: 60,
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

  // ---------------------------------------------
  // Chart 5: TOTAL COMMENTS
  // ---------------------------------------------
  function renderCommentsCountChart(data) {
    const labels = data.map(post => {
      const { title } = post;
      if (title.length > MAX_LABEL_LENGTH) {
        return title.slice(0, MAX_LABEL_LENGTH) + '…';
      } else {
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
            font: { size: 18, weight: '600', family: 'Arial, sans-serif' },
            color: '#333',
            padding: { top: 10, bottom: 20 }
          },
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: 'ctrl',
            },
            zoom: {
              drag: { enabled: true },
              pinch: { enabled: true },
              mode: 'x',
            },
          }
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 60,
              minRotation: 60,
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

  async function fetchAndDisplayPostDetails(postId) {
    const postDetailsContainer = document.getElementById('post-details');
    postDetailsContainer.innerHTML = '<p>Loading post details...</p>'; // Loading message

    // Identify the posts collection
    const subredditSelect = document.getElementById('subreddit-select');
    const selectedSubreddit = subredditSelect.value;
    const lowerSub = selectedSubreddit.toLowerCase();
    const postsCollection = (lowerSub === "temasekpoly") ? "posts" : `${lowerSub}_posts`;

    const postRef = doc(db, postsCollection, postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
        postDetailsContainer.innerHTML = `<div style="padding: 20px; background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 8px; color: #664d03;">No details available for this post.</div>`;
        return;
    }

    const postData = postSnap.data();

    // --- Extract Data ---
    const postTitle = postData.title || "No Title";
    const author = postData.author || 'Unknown';
    const postUrl = postData.URL || '#'; // Use URL from postData
    const date = postData.created?.toDate ? postData.created.toDate() : (postData.created ? new Date(postData.created) : new Date());
    const formattedDate = date.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
    }).replace(',', '');

    // --- Build HTML Sections with Enhanced Styles ---

    // 1. Title Section
    const urlHtml = `
        <h2 style="margin-top: 0; margin-bottom: 5px; font-size: 1.8em; color: #2c3e50;">
            <a href="${postUrl}" target="_blank" style="color: inherit; text-decoration: none; hover: {color: #3498db;}">
                ${postTitle}
            </a>
        </h2>`;

    // 2. Metadata Section
    const metaHtml = `
        <p style="font-size: 0.9em; color: #7f8c8d; margin-bottom: 20px; border-bottom: 1px dashed #ecf0f1; padding-bottom: 10px;">
            Posted by <strong>${author}</strong> on ${formattedDate}
        </p>`;

    // 3. Badges Section (add margin)
    const badgesHtml = `
        <div style="margin-bottom: 25px;">
            ${generateBadgesHtml(postData)}
        </div>`;

    // 4. Summary Section (using the previously improved style)
    const summaryHtml = `
      <div style="background-color: #ecf0f1; /* Slightly different gray */
                  border-left: 5px solid #3498db; /* Different Blue */
                  padding: 15px 20px;
                  margin-bottom: 25px;
                  border-radius: 5px;">
        <h4 style="margin-top: 0; margin-bottom: 8px; color: #2980b9; font-weight: 600;">
            💡 AI Generated Summary & Analysis
        </h4>
        <p style="font-size: 0.95em; color: #34495e; line-height: 1.6;">
            ${postData.summary || '<i>No summary provided.</i>'}
        </p>
      </div>`;

    // 5. Body Section (cleaner presentation)
    const bodyHtml = `
      <div class="post-body-content" style="margin-bottom: 30px;">
        <h4 style="margin-top: 0; margin-bottom: 10px; color: #555; font-weight: 600;">Original Post Content:</h4>
        <div style="font-size: 1.0em; color: #333; line-height: 1.7; background-color: #fff; padding: 15px; border-radius: 4px; border: 1px solid #eee;">
            ${postData.body || '<i>No body content provided.</i>'}
        </div>
      </div>`;

    // 6. Comments Section
    const commentsRef = collection(db, `${postsCollection}/${postId}/comments`);
    const commentsSnapshot = await getDocs(commentsRef);

    let commentsHtml = `
        <h3 style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #eee; color: #555; font-weight: 600;">
            Comments (${commentsSnapshot.size}):
        </h3>`;

    if (commentsSnapshot.size === 0) {
        commentsHtml += `<p style="color: #7f8c8d; font-style: italic;">No comments available.</p>`;
    } 
    else {
      commentsSnapshot.forEach(commentDoc => {
        const commentData = commentDoc.data();
        const commentDate = commentData.created?.toDate ? commentData.created.toDate() : (commentData.created ? new Date(commentData.created) : new Date());
        const commentAuthor = commentData.author || 'Unknown';
        const formattedCommentDate = commentDate.toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).replace(',', '');

        // Note: generateCommentBadgesHtml is assumed to be defined elsewhere
        const commentBadges = generateCommentBadgesHtml(commentData);

        commentsHtml += `
          <div class="search-result-comment" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <p style="font-size: 0.85em; color: #6b7280; margin-bottom: 8px;">
                  Comment by <strong>${commentAuthor}</strong> on ${formattedCommentDate}
              </p>
              <p style="font-size: 0.95em; color: #1f2937; line-height: 1.6; margin-bottom: 10px; padding-left: 10px; border-left: 3px solid #d1d5db;">
                  ${commentData.body || '<i>No comment body.</i>'}
              </p>
              <div style="margin-bottom: 10px;">${commentBadges}</div>
          </div>
        `;
      });
    }

    // --- Assemble Final HTML in a Styled Container ---
    postDetailsContainer.innerHTML = `
      <div class="post-details-wrapper" style="padding: 25px 30px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08); border: 1px solid #e7eaf3;">
          ${urlHtml}       ${metaHtml}      ${badgesHtml}    ${summaryHtml}   ${bodyHtml}      ${commentsHtml}  </div>
    `;
  }

  // ---------------------------------------------
  // Post List Dropdown / Table
  // ---------------------------------------------
  const postListDropdown = document.getElementById('postListDropdown');
  postListDropdown.addEventListener('change', () => {
    renderPostList(allPostsData, postListDropdown.value);
  });

  function renderPostList(data, listType) {
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

    // Make each row clickable
    container.querySelectorAll('tr[data-post-id]').forEach(row => {
      row.addEventListener('click', () => {
        // Remove 'selected' from any previously clicked row
        container.querySelectorAll('tr.selected').forEach(sel => sel.classList.remove('selected'));
        // Add 'selected' to the clicked row
        row.classList.add('selected');
        const postId = row.getAttribute('data-post-id');
        fetchAndDisplayPostDetails(postId);
      });
    });
  }

  function buildPostsTable(posts) {
    if (!posts || posts.length === 0) {
      return `<p>No posts found for this filter.</p>`;
    }
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

  // ---------------------------------------------
  // Author Stats & Chart
  // ---------------------------------------------
  async function fetchAuthorStats() {
    // Identify authors collection
    const subredditSelect = document.getElementById('subreddit-select');
    const selectedSubreddit = subredditSelect.value;
    const lowerSub = selectedSubreddit.toLowerCase();
    const authorsCollection = (lowerSub === "temasekpoly") ? "authors" : `${lowerSub}_authors`;

    const authorsSnapshot = await getDocs(collection(db, authorsCollection));
    let authorArray = [];
    authorsSnapshot.forEach(doc => {
      const data = doc.data();
      data.author = doc.id; // doc ID as the author name
      authorArray.push(data);
    });
    // Sort by negativeCount descending
    authorArray.sort((a, b) => b.negativeCount - a.negativeCount);
    // Return top 10
    return authorArray.slice(0, 10);
  }

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
            backgroundColor: 'rgba(75, 192, 192, 0.8)',
          },
          {
            label: 'Negative Count',
            data: negativeCounts,
            backgroundColor: 'rgba(255, 99, 132, 0.8)',
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
            font: { size: 18, weight: '600', family: 'Arial, sans-serif' },
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
            fetchAndDisplayPostsAndCommentsByAuthor(authorName);
          }
        }
      }
    });
  }

  async function updateAuthorsChart() {
    try {
      const authorData = await fetchAuthorStats();
      renderAuthorsChart(authorData);
    } catch (error) {
      console.error("Error updating authors chart:", error);
    }
  }

  // ---------------------------------------------
  // Category Time Series
  // ---------------------------------------------
  // Helper function to fetch the time-series data from "category_stats" or "{sub}_category_stats"
  async function fetchTimeSeriesData() {
    const startDateValue = document.getElementById('start-date').value;
    const endDateValue = document.getElementById('end-date').value;
    const startDate = new Date(startDateValue);
    const endDate = new Date(endDateValue);
    endDate.setHours(23, 59, 59, 999);

    const subredditSelect = document.getElementById('subreddit-select');
    const selectedSubreddit = subredditSelect.value;
    const lowerSub = selectedSubreddit.toLowerCase();
    const categoryCollection = (lowerSub === "temasekpoly") ? "category_stats" : `${lowerSub}_category_stats`;

    const catStatsSnapshot = await getDocs(collection(db, categoryCollection));
    let timeSeriesData = {};

    catStatsSnapshot.forEach(docSnap => {
      const dateStr = docSnap.id; // YYYY-MM-DD doc ID
      const docDate = new Date(dateStr);
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

  // Compute a simple moving average
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

  function setAlpha(rgba, alpha) {
    return rgba.replace(/, 1\)/, `, ${alpha})`);
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
    return PREDEFINED_CATEGORY_COLORS[key] || "#26C6DA";
  }

  function renderTimeSeriesChart(data) {
    let datasets = [];
    for (let category in data) {
      const color = getCategoryColor(category);

      // (raw) data
      datasets.push({
        label: category + " (raw)",
        data: data[category],
        fill: false,
        borderColor: setAlpha(color, 0.3),
        tension: 0.1,
        borderWidth: 0.5,
        hidden: (category.toLowerCase() !== 'academic')
      });
      // 7-day MA
      datasets.push({
        label: category + " (7-day MA)",
        data: computeMovingAverage(data[category], 7),
        fill: false,
        borderColor: color,
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
      data: { datasets: datasets },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Time Series of Average Sentiment by Category',
            align: 'start',
            font: { size: 18, weight: '600' }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
          },
          legend: {
            labels: {
              generateLabels: function(chart) {
                const dsets = chart.data.datasets;
                const seenCategories = {};
                const labels = [];
                dsets.forEach((dataset, i) => {
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
                // Sort labels alphabetically
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
              parser: 'yyyy-MM-dd',
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
        onClick: async (evt, elements) => {
          if (elements.length > 0) {
            const element = elements[0];
            const datasetIndex = element.datasetIndex;
            const index = element.index;
            const dataset = window.timeSeriesChartInstance.data.datasets[datasetIndex];
            const categoryLabel = dataset.label.split(" ")[0];
            const category = categoryLabel.toLowerCase();
            const dataPoint = dataset.data[index];
            const dateStr = dataPoint.x;
            console.log(`Clicked on Category: ${category}, Date: ${dateStr}`);
            await fetchAndDisplayPostsByCategoryAndDate(category, dateStr);
          }
        }
      }
    });
  }

  async function updateTimeSeriesChart() {
    try {
      const tsData = await fetchTimeSeriesData();
      renderTimeSeriesChart(tsData);
    } catch (error) {
      console.error("Error updating time series chart:", error);
    }
  }

  // For clicking a data point in the time series chart
 async function fetchAndDisplayPostsByCategoryAndDate(category, dateStr) {
  const container = document.getElementById('post-details');
  // Loading message
  container.innerHTML = `<div style="padding: 20px; text-align: center; color: #555;"><i>Loading activity for category "${category}" on ${dateStr}...</i></div>`;

  const subredditSelect = document.getElementById('subreddit-select');
  const selectedSubreddit = subredditSelect.value;
  const lowerSub = selectedSubreddit.toLowerCase();
  const postsCollection = (lowerSub === "temasekpoly") ? "posts" : `${lowerSub}_posts`;
  const categoryCollection = (lowerSub === "temasekpoly") ? "category_stats" : `${lowerSub}_category_stats`;

  try { // Added try block for fetching stats
      const statsDocRef = doc(db, categoryCollection, dateStr);
      const statsDocSnap = await getDoc(statsDocRef);

      const formattedCategory = category.charAt(0).toUpperCase() + category.slice(1); // Capitalize category

      // Styled message if no stats data found for the date
      if (!statsDocSnap.exists()) {
          container.innerHTML = `<div style="padding: 20px; background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 8px; color: #664d03;">No activity data found for category <strong>${formattedCategory}</strong> on ${dateStr}.</div>`;
          return;
      }

      const statsData = statsDocSnap.data();
      // Styled message if no data for the specific category on that date
      if (!statsData || !statsData[category]) {
          container.innerHTML = `<div style="padding: 20px; background-color: #e9ecef; border: 1px solid #dee2e6; border-radius: 8px; color: #495057;">No posts or comments found specifically for category <strong>${formattedCategory}</strong> on ${dateStr}.</div>`;
          return;
      }

      const postIds = statsData[category].postIds || [];
      const commentsMap = statsData[category].comments || {};
      const totalCommentCount = Object.keys(commentsMap).reduce((acc, key) => acc + commentsMap[key].length, 0); // Calculate total comments

      // --- Pre-fetch Post Titles for Comments Context ---
      let postTitlesMap = {};
      let uniquePostIdsInComments = Object.keys(commentsMap);
      if (uniquePostIdsInComments.length > 0) {
         const uniquePostRefs = uniquePostIdsInComments.map(id => doc(db, postsCollection, id));
         // Fetch titles concurrently, handling potential errors for individual fetches
         const parentPostSnaps = await Promise.all(uniquePostRefs.map(ref => getDoc(ref).catch(e => { console.error(`Failed to fetch parent post ${ref.id} for category view`, e); return null; })));
         parentPostSnaps.forEach(snap => {
             if (snap && snap.exists()) {
                 postTitlesMap[snap.id] = snap.data().title || 'Untitled Post';
             } else if (snap) { // Doc ref exists but not the document itself
                  postTitlesMap[snap.id] = 'Unknown Post (Deleted?)';
             }
             // If snap is null (fetch error), it's handled when looking up in the map later
         });
      }
      // --- End Pre-fetch ---


      // Start building HTML with an outer wrapper and main heading
      let html = `
        <div class="category-date-details-wrapper" style="padding: 25px 30px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e7eaf3;">
          <h2 style="margin-top: 0; margin-bottom: 25px; font-size: 1.8em; color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 10px;">
            Category: <span style="color: #3498db;">${formattedCategory}</span> <span style="color: #7f8c8d;">on ${dateStr}</span>
          </h2>
      `;

      // --- Display Posts ---
      html += `<h3 style="margin-top: 0; margin-bottom: 15px; color: #34495e; font-size: 1.4em;">Posts (${postIds.length}):</h3>`;
      if (postIds.length === 0) {
          html += `<p style="color: #7f8c8d; font-style: italic; margin-left: 10px; margin-bottom: 25px;">No posts found in this category on this date.</p>`;
      } else {
          // Fetch posts concurrently
          const postPromises = postIds.map(postId => getDoc(doc(db, postsCollection, postId)).catch(e => { console.error(`Failed to fetch post ${postId}`, e); return null; }));
          const postSnaps = await Promise.all(postPromises);

          postSnaps.forEach(postSnap => {
              if (postSnap && postSnap.exists()) { // Check if snap exists and fetch succeeded
                  const postData = postSnap.data();
                  const postId = postSnap.id;
                  const postTitle = postData.title || "No Title";
                  const postBody = postData.body || "";
                  const author = postData.author || 'Unknown';
                  const postUrl = postData.URL || '#';
                  let date = new Date();
                  if (postData.created?.toDate) date = postData.created.toDate();
                  else if (postData.created) try { date = new Date(postData.created); } catch (e) {}
                  const formattedPostDate = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); // Removed time for brevity in list view

                  // Post card styling
                  html += `
                    <div class="search-result-post category-post-item" style="background-color: #fdfdfe; border: 1px solid #e9ecef; border-radius: 8px; padding: 15px 20px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
                      <h4 style="margin-top: 0; margin-bottom: 5px; font-size: 1.2em;">
                        <a href="${postUrl}" target="_blank" style="color: #2980b9; text-decoration: none; hover:{text-decoration: underline;}">${postTitle}</a>
                      </h4>
                      <p style="font-size: 0.85em; color: #7f8c8d; margin-bottom: 15px;">By <strong>${author}</strong> on ${formattedPostDate}</p>
                      <p style="font-size: 0.95em; color: #34495e; line-height: 1.6; margin-bottom: 15px; max-height: 70px; overflow: hidden; text-overflow: ellipsis;">
                        ${postBody || '<i>No body content</i>'}
                      </p>
                      <div style="margin-bottom: 10px;">${generateBadgesHtml(postData)}</div>
                      <button class="view-full-post-btn" data-post-id="${postId}" style="margin-top: 5px; padding: 6px 14px; font-size: 0.9em; background-color: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.2s ease;">
                        View Full Post
                      </button>
                    </div>
                  `;
              } else {
                  // Handle missing post or fetch error
                   html += `<div style="border: 1px dashed #ccc; padding: 10px; margin-bottom: 15px; color: #777;"><em>Post data unavailable or failed to load.</em></div>`;
              }
          });
      }

      // --- Display Comments ---
      html += `<h3 style="margin-top: 30px; margin-bottom: 15px; color: #34495e; font-size: 1.4em; border-top: 1px solid #eee; padding-top: 25px;">Comments (${totalCommentCount}):</h3>`;
      if (totalCommentCount === 0) {
          html += `<p style="color: #7f8c8d; font-style: italic; margin-left: 10px;">No comments found in this category on this date.</p>`;
      } else {
           // Fetch comments concurrently
           let commentFetchPromises = [];
           for (const postId in commentsMap) {
               commentsMap[postId].forEach(commentId => {
                   const commentRef = doc(db, `${postsCollection}/${postId}/comments`, commentId);
                   commentFetchPromises.push(getDoc(commentRef).catch(e => { console.error(`Failed to fetch comment ${commentId} in post ${postId}`, e); return null; }));
               });
           }
           const commentSnaps = await Promise.all(commentFetchPromises);

           commentSnaps.forEach(commentSnap => {
               if (commentSnap && commentSnap.exists()) { // Check if snap exists and fetch succeeded
                  const commentData = commentSnap.data();
                  const author = commentData.author || 'Unknown';
                  const commentBody = commentData.body || "";
                  const commentPostId = commentSnap.ref.parent.parent.id;
                  const parentPostTitle = postTitlesMap[commentPostId] || 'Unknown Post'; // Use pre-fetched title

                  let date = new Date();
                  if (commentData.created?.toDate) date = commentData.created.toDate();
                  else if (commentData.created) try { date = new Date(commentData.created); } catch (e) {}
                  const formattedDate = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); // Removed time

                  const commentBadges = generateCommentBadgesHtml(commentData);

                  // Comment card styling
                  html += `
                    <div class="search-result-comment category-comment-item" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <p style="font-size: 0.85em; color: #6b7280; margin-bottom: 8px;">
                            In Post: <span style="font-style: italic;">"${parentPostTitle}"</span> (Comment by <strong>${author}</strong> on ${formattedDate})
                        </p>
                        <p style="font-size: 0.95em; color: #1f2937; line-height: 1.6; margin-bottom: 10px; padding-left: 10px; border-left: 3px solid #d1d5db;">
                            ${commentBody || '<i>No comment body.</i>'}
                        </p>
                        <div style="margin-bottom: 10px;">${commentBadges}</div>
                         <button class="view-full-post-btn" data-post-id="${commentPostId}" style="margin-top: 5px; padding: 6px 14px; font-size: 0.9em; background-color: #5dade2; color: white; border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.2s ease;">
                             View Post Thread
                         </button>
                    </div>
                  `;
               } else {
                   // Handle missing comment or fetch error (optional message)
                   // html += `<p><em>Comment data unavailable or failed to load.</em></p>`;
               }
           });
      }

      // Close the main wrapper div
      html += `</div>`;

      container.innerHTML = html;

      // Re-Add event listeners (Important!)
      container.querySelectorAll('.view-full-post-btn').forEach(button => { // Only need this selector now
          button.addEventListener('click', (event) => {
              // event.preventDefault(); // Not needed for button element
              const postId = button.getAttribute('data-post-id');
              if (postId) {
                  fetchAndDisplayPostDetails(postId);
              } else {
                  console.error("Could not find data-post-id on clicked element:", button);
              }
          });
      });

    } catch (error) { // Catch errors during initial stats fetch or processing
        console.error(`Error fetching details for category ${category} on ${dateStr}:`, error);
        // Styled error message
        container.innerHTML = `<div style="padding: 20px; background-color: #f8d7da; border: 1px solid #f5c2c7; border-radius: 8px; color: #842029;">Error fetching activity details. Please check the console.</div>`;
    }
  } // End of function

  // For clicking a data point in the time series chart
  async function fetchAndDisplayPostsByCategoryAndDate_old_style(category, dateStr) {
    const container = document.getElementById('post-details');
    container.innerHTML = `<p>Loading posts and comments for ${category} on ${dateStr}...</p>`;

    const subredditSelect = document.getElementById('subreddit-select');
    const selectedSubreddit = subredditSelect.value;
    const lowerSub = selectedSubreddit.toLowerCase();
    const postsCollection = (lowerSub === "temasekpoly") ? "posts" : `${lowerSub}_posts`;
    const categoryCollection = (lowerSub === "temasekpoly") ? "category_stats" : `${lowerSub}_category_stats`;

    const statsDocRef = doc(db, categoryCollection, dateStr);
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
    const commentsMap = statsData[category].comments || {};

    let html = `<h3>Posts for ${category} on ${dateStr}:</h3>`;
    for (const postId of postIds) {
      const postRef = doc(db, postsCollection, postId);
      const postSnap = await getDoc(postRef);
      if (postSnap.exists()) {
        const postData = postSnap.data();
        const postTitle = postData.title || "No Title";
        const postBody = postData.body || "";
        const author = postData.author || 'Unknown';
        
        let date = new Date(); // Fallback
        if (postData.created && postData.created.toDate) {
          date = postData.created.toDate();
        } 
        else if (postData.created) {
          try { 
            date = new Date(postData.created); 
          } 
          catch(e) {}
        }
        const formattedPostDate = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });        
        const postUrl = postData.URL || '#';
        html += `
          <div class="search-result-post" style="border: 1px solid #ddd; padding: 10px; margin-bottom: 15px;">
            <h4><a href="${postUrl}" target="_blank">${postTitle}</a></h4>
            <p style="font-size: 0.8em; color: #555;">By ${author} on ${formattedPostDate}</p>
            <p>${postBody ? postBody : '<i>No body content</i>'}</p>
            ${generateBadgesHtml(postData)}
            <button class="view-full-post-btn" data-post-id="${postId}" style="margin-top: 5px; padding: 3px 8px; font-size: 0.8em;">
              View Full Post & Comments
            </button>
          </div>
        `;
      }
    }

    html += `<h3>Comments for ${category} on ${dateStr}:</h3>`;
    for (const postId in commentsMap) {
      const commentIds = commentsMap[postId];
      for (const commentId of commentIds) {
        const commentRef = doc(db, `${postsCollection}/${postId}/comments`, commentId);
        const commentSnap = await getDoc(commentRef);

        if (commentSnap.exists()) {
          const commentData = commentSnap.data();
          const author = commentData.author || 'Unknown';
          const commentBody = commentData.body || "";
          const commentPostId = commentSnap.ref.parent.parent.id; // *** Get postId from reference ***
          let date = new Date(); // Fallback
          if (commentData.created && commentData.created.toDate) {
            date = commentData.created.toDate();
          } 
          else if (commentData.created) {
            try { 
              date = new Date(commentData.created); 
            } 
            catch(e) {}
          }
          const formattedDate = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

          html += `
          <div class="search-result-comment" style="border: 1px solid #eee; padding: 10px; margin-bottom: 10px; background-color: #f9f9f9;">
            <p style="font-size: 0.8em; color: #555;">
              Comment by ${author} on ${formattedDate}
            </p>
            <p>${commentBody}</p>
            ${generateCommentBadgesHtml(commentData)}
            <button class="view-full-post-btn" data-post-id="${commentPostId}" style="margin-top: 5px; padding: 3px 8px; font-size: 0.8em;">
              View Full Post & Comments
            </button>
          </div>
          `;
        }
      }
    }

    container.innerHTML = html;
    container.querySelectorAll('.view-full-post-btn, .view-full-post-link').forEach(button => {
      button.addEventListener('click', (event) => {
          event.preventDefault(); // Important for the <a> link version
          const postId = button.getAttribute('data-post-id');
          if (postId) {
              fetchAndDisplayPostDetails(postId);
          } 
          else {
              console.error("Could not find data-post-id on clicked element:", button);
          }
      });
    });
  }
// For clicking on the authors chart bars
async function fetchAndDisplayPostsAndCommentsByAuthor(authorName) {
  const container = document.getElementById('post-details');
  // Loading message with basic styling
  container.innerHTML = `<div style="padding: 20px; text-align: center; color: #555;"><i>Loading posts and comments for ${authorName}...</i></div>`;

  const subredditSelect = document.getElementById('subreddit-select');
  const selectedSubreddit = subredditSelect.value;
  const lowerSub = selectedSubreddit.toLowerCase();
  const postsCollectionName = (lowerSub === "temasekpoly") ? "posts" : `${lowerSub}_posts`;
  const authorsCollectionName = (lowerSub === "temasekpoly") ? "authors" : `${lowerSub}_authors`;

  try {
      const authorRef = doc(db, authorsCollectionName, authorName);
      const authorSnap = await getDoc(authorRef);

      // Styled message if author not found
      if (!authorSnap.exists()) {
          container.innerHTML = `<div style="padding: 20px; background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 8px; color: #664d03;">No activity data found for author: <strong>${authorName}</strong>.</div>`;
          return;
      }

      const authorData = authorSnap.data();
      const postIds = authorData.posts || [];
      const commentsMap = authorData.comments || {}; // { postId: [commentId1, commentId2], ... }

      // Start building HTML with an outer wrapper and main heading
      let html = `
        <div class="author-details-wrapper" style="padding: 25px 30px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e7eaf3;">
          <h2 style="margin-top: 0; margin-bottom: 25px; font-size: 1.8em; color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 10px;">
            Activity by ${authorName}
          </h2>
      `;

      // --- Fetch and Display Posts ---
      html += `<h3 style="margin-top: 0; margin-bottom: 15px; color: #34495e; font-size: 1.4em;">Posts (${postIds.length}):</h3>`;
      if (postIds.length === 0) {
          html += `<p style="color: #7f8c8d; font-style: italic; margin-left: 10px; margin-bottom: 25px;">No posts found by this author.</p>`;
      } else {
          const postPromises = postIds.map(postId => getDoc(doc(db, postsCollectionName, postId)));
          const postSnaps = await Promise.all(postPromises);

          postSnaps.forEach(postSnap => {
              if (postSnap.exists()) {
                  const postData = postSnap.data();
                  const postId = postSnap.id;
                  const postTitle = postData.title || "No Title";
                  const postBody = postData.body || "";
                  const postAuthor = postData.author || 'Unknown'; // Should match authorName
                  const postUrl = postData.URL || '#';
                  let postDate = new Date();
                  if (postData.created?.toDate) postDate = postData.created.toDate();
                  else if (postData.created) try { postDate = new Date(postData.created); } catch (e) {}
                  const formattedPostDate = postDate.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');

                  // Card styling for each post
                  html += `
                    <div class="search-result-post author-post-item" style="background-color: #fdfdfe; border: 1px solid #e9ecef; border-radius: 8px; padding: 15px 20px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
                      <h4 style="margin-top: 0; margin-bottom: 5px; font-size: 1.2em;">
                        <a href="${postUrl}" target="_blank" style="color: #2980b9; text-decoration: none; hover:{text-decoration: underline;}">${postTitle}</a>
                      </h4>
                      <p style="font-size: 0.85em; color: #7f8c8d; margin-bottom: 15px;">Posted on ${formattedPostDate}</p>
                      <p style="font-size: 0.95em; color: #34495e; line-height: 1.6; margin-bottom: 15px; max-height: 100px; overflow: hidden; text-overflow: ellipsis;">
                        ${postBody || '<i>No body content</i>'}
                      </p>
                      <div style="margin-bottom: 10px;">${generateBadgesHtml(postData)}</div>
                      <button class="view-full-post-btn" data-post-id="${postId}" style="margin-top: 5px; padding: 6px 14px; font-size: 0.9em; background-color: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.2s ease;">
                        View Full Post
                      </button>
                    </div>
                  `;
              } else {
                  console.warn(`Post document with ID ${postSnap.id} not found for author ${authorName}.`);
                   html += `<div style="border: 1px dashed #ccc; padding: 10px; margin-bottom: 15px; color: #777;"><em>Post data unavailable.</em></div>`; // Simple notice for missing post
              }
          });
      }

      // --- Fetch and Display Comments ---
      let commentFetchPromises = [];
      let postTitlesMap = {}; // To store fetched post titles for comments {postId: title}
      let parentPostIds = Object.keys(commentsMap);
      let commentCount = 0;

      // Pre-fetch needed parent post titles (reduces reads inside the comment loop)
      if (parentPostIds.length > 0) {
          const uniquePostRefs = parentPostIds.map(id => doc(db, postsCollectionName, id));
          const parentPostSnaps = await Promise.all(uniquePostRefs.map(ref => getDoc(ref).catch(e => { console.error(`Failed to fetch parent post ${ref.id}`, e); return null; }))); // Fetch all parents, handle errors
          parentPostSnaps.forEach(snap => {
              if (snap && snap.exists()) {
                  postTitlesMap[snap.id] = snap.data().title || 'Untitled Post';
              } else if (snap) { // snap exists but document doesn't
                   postTitlesMap[snap.id] = 'Unknown Post (Deleted?)';
              }
              // If snap is null due to fetch error, it won't be added, handled later
          });
      }

      // Prepare comment fetch promises
      for (const postId in commentsMap) {
          const commentIds = commentsMap[postId];
          commentCount += commentIds.length;
          commentIds.forEach(commentId => {
              const commentRef = doc(db, `${postsCollectionName}/${postId}/comments`, commentId);
              commentFetchPromises.push(getDoc(commentRef));
          });
      }

      // Comments Section Heading
      html += `<h3 style="margin-top: 30px; margin-bottom: 15px; color: #34495e; font-size: 1.4em; border-top: 1px solid #eee; padding-top: 25px;">Comments (${commentCount}):</h3>`;

      if (commentFetchPromises.length === 0) {
          html += `<p style="color: #7f8c8d; font-style: italic; margin-left: 10px;">No comments found by this author.</p>`;
      } else {
          const commentSnaps = await Promise.all(commentFetchPromises);

          commentSnaps.forEach(commentSnap => {
              if (commentSnap && commentSnap.exists()) { // Check if snap itself exists
                  const commentData = commentSnap.data();
                  const commentBody = commentData.body || "";
                  const commentAuthor = commentData.author || 'Unknown'; // Should match authorName
                  const commentPostId = commentSnap.ref.parent.parent.id;
                  const parentPostTitle = postTitlesMap[commentPostId] || 'Unknown Post'; // Get title from pre-fetched map

                  let commentDate = new Date();
                  if (commentData.created?.toDate) commentDate = commentData.created.toDate();
                  else if (commentData.created) try { commentDate = new Date(commentData.created); } catch (e) {}
                  const formattedCommentDate = commentDate.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');

                  const commentBadges = generateCommentBadgesHtml(commentData);

                  // Card styling for each comment
                  html += `
                    <div class="search-result-comment author-comment-item" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <p style="font-size: 0.85em; color: #6b7280; margin-bottom: 8px;">
                            In Post: <span style="font-style: italic;">"${parentPostTitle}"</span> (On ${formattedCommentDate})
                        </p>
                        <p style="font-size: 0.95em; color: #1f2937; line-height: 1.6; margin-bottom: 10px; padding-left: 10px; border-left: 3px solid #d1d5db;">
                            ${commentBody || '<i>No comment body.</i>'}
                        </p>
                        <div style="margin-bottom: 10px;">${commentBadges}</div>
                         <button class="view-full-post-btn" data-post-id="${commentPostId}" style="margin-top: 5px; padding: 6px 14px; font-size: 0.9em; background-color: #5dade2; color: white; border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.2s ease;">
                             View Post Thread
                         </button>
                    </div>
                  `;
              } else {
                  // Handle case where a commentId listed doesn't exist or fetch failed
                  console.warn(`Comment snapshot unavailable for author ${authorName}.`);
                  // Optionally add a placeholder in HTML, but might clutter if many fail
                  // html += `<p><em>Error: Comment data unavailable.</em></p>`
              }
          });
      }

      // Close the main wrapper div
      html += `</div>`;

      container.innerHTML = html;

      // Re-Add event listeners (Important!)
      container.querySelectorAll('.view-full-post-btn').forEach(button => { // Simplified selector
          button.addEventListener('click', (event) => {
              // event.preventDefault(); // Not strictly needed for buttons
              const postId = button.getAttribute('data-post-id');
              if (postId) {
                  fetchAndDisplayPostDetails(postId);
              } else {
                  console.error("Missing data-post-id on button:", button);
              }
          });
      });

    } 
    catch (error) {
        console.error(`Error fetching details for author ${authorName}:`, error);
        // Styled error message
        container.innerHTML = `<div style="padding: 20px; background-color: #f8d7da; border: 1px solid #f5c2c7; border-radius: 8px; color: #842029;">Error fetching details for <strong>${authorName}</strong>. Please check the console.</div>`;
    }
  }
  // For clicking on the authors chart bars
  async function fetchAndDisplayPostsAndCommentsByAuthor_old_styling(authorName) {
    const container = document.getElementById('post-details');
    container.innerHTML = `<p>Loading posts and comments for ${authorName}...</p>`;

    const subredditSelect = document.getElementById('subreddit-select');
    const selectedSubreddit = subredditSelect.value;
    const lowerSub = selectedSubreddit.toLowerCase();
    const postsCollectionName = (lowerSub === "temasekpoly") ? "posts" : `${lowerSub}_posts`; // Renamed for clarity
    const authorsCollectionName = (lowerSub === "temasekpoly") ? "authors" : `${lowerSub}_authors`; // Renamed for clarity

    try {
      const authorRef = doc(db, authorsCollectionName, authorName);
      const authorSnap = await getDoc(authorRef);

      if (!authorSnap.exists()) {
        container.innerHTML = `<p>No data found for author ${authorName}.</p>`;
        return;
      }

      const authorData = authorSnap.data();
      const postIds = authorData.posts || [];
      const commentsMap = authorData.comments || {}; // { postId: [commentId1, commentId2], ... }

      let html = `<h2>Posts and Comments by ${authorName}</h2>`;

      // --- Fetch and Display Posts ---
      html += `<h3>Posts (${postIds.length}):</h3>`;
      if (postIds.length === 0) {
        html += `<p>No posts found.</p>`;
      } 
      else {
        // Fetch all post documents in parallel
        const postPromises = postIds.map(postId => getDoc(doc(db, postsCollectionName, postId)));
        const postSnaps = await Promise.all(postPromises);

        postSnaps.forEach(postSnap => {
          if (postSnap.exists()) {
            const postData = postSnap.data();
            const postId = postSnap.id; // Get the actual post ID
            const postTitle = postData.title || "No Title";
            const postBody = postData.body || "";
            const postAuthor = postData.author || 'Unknown'; // Use specific author from post data if needed, though should match authorName
            const postUrl = postData.URL || '#';

            // --- Correct Date Formatting for EACH post ---
            let postDate = new Date(); // Fallback date
            if (postData.created && postData.created.toDate) {
              postDate = postData.created.toDate();
            } 
            else if (postData.created) {
              // Attempt to parse if it's not a Timestamp (e.g., ISO string)
              try { 
                postDate = new Date(postData.created); 
              } 
              catch (e) { 
                console.warn("Could not parse post date:", postData.created); 
              }
            }
            const formattedPostDate = postDate.toLocaleString('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit', hour12: false
            }).replace(',', '');
            // --- End Date Correction ---

            html += `
              <div class="search-result-post" style="border: 1px solid #ddd; padding: 10px; margin-bottom: 15px;">
                <h4>
                  <a href="${postUrl}" target="_blank">${postTitle}</a>
                </h4>
                <p style="font-size: 0.8em; color: #555;">By ${postAuthor} on ${formattedPostDate}</p>
                <p>${postBody ? postBody.substring(0, 350) + (postBody.length > 350 ? '...' : '') : 
                  '<i>No body content</i>'}
                </p>
                ${generateBadgesHtml(postData)}
                <button class="view-full-post-btn" data-post-id="${postId}" style="margin-top: 5px; padding: 3px 8px; font-size: 0.8em;">
                  View Full Post & Comments
                </button>
              </div>
            `;
          } 
          else {
            // Handle case where a postId listed in author doc doesn't exist in posts collection
            console.warn(`Post document with ID ${postSnap.id /* or corresponding postId from postIds array */} not found.`);
            html += `<p><em>Error: Post data unavailable for one entry.</em></p>`
          }
        });
      }

      // --- Fetch and Display Comments ---
      let commentFetchPromises = [];
      let commentCount = 0;
      for (const postId in commentsMap) {
        const commentIds = commentsMap[postId];
        commentCount += commentIds.length;
        commentIds.forEach(commentId => {
          // Create the promise to fetch the comment document
          const commentRef = doc(db, `${postsCollectionName}/${postId}/comments`, commentId);
          commentFetchPromises.push(getDoc(commentRef));
        });
      }

      html += `<h3>Comments (${commentCount}):</h3>`;

      if (commentFetchPromises.length === 0) {
        html += `<p>No comments found.</p>`;
      } 
      else {
        // Fetch all comment documents in parallel
        const commentSnaps = await Promise.all(commentFetchPromises);

        commentSnaps.forEach(commentSnap => {
          if (commentSnap.exists()) {
            const commentData = commentSnap.data();
            const commentBody = commentData.body || "";
            const commentAuthor = commentData.author || 'Unknown'; // Should match authorName
            const commentPostId = commentSnap.ref.parent.parent.id; // *** Get postId from reference ***
            // const commentPostTitle = commentData.postTitle || 'Unknown Post Title'; // Added fallback

            // --- Correct Date Formatting for EACH comment ---
            let commentDate = new Date(); // Fallback date
            if (commentData.created && commentData.created.toDate) {
              commentDate = commentData.created.toDate();
            } 
            else if (commentData.created) {
              try { 
                commentDate = new Date(commentData.created); 
              } 
              catch (e) { 
                console.warn("Could not parse comment date:", commentData.created); 
              }
            }
            const formattedCommentDate = commentDate.toLocaleString('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit', hour12: false
            }).replace(',', '');
            // --- End Date Correction ---

            html += `
              <div class="search-result-comment" style="border: 1px solid #eee; padding: 10px; margin-bottom: 10px; background-color: #f9f9f9;">
                <p style="font-size: 0.8em; color: #555;">
                  Comment by ${commentAuthor} on ${formattedCommentDate}
                </p>
                <p>${commentBody}</p>
                ${generateCommentBadgesHtml(commentData)}
                
                <button class="view-full-post-btn" data-post-id="${commentPostId}" style="margin-top: 5px; padding: 3px 8px; font-size: 0.8em;">
                  View Full Post & Comments
                </button>
              </div>
            `;
          } 
          else {
            // Handle case where a commentId listed doesn't exist
            console.warn(`Comment document with ID ${commentSnap.id /* Might need more context to know original commentId/postId here if ref is null */} not found.`);
            html += `<p><em>Error: Comment data unavailable for one entry.</em></p>`
          }
        });
      }

      container.innerHTML = html;

      // Re-Add event listeners for the dynamically added "View Full Post" buttons/links
      container.querySelectorAll('.view-full-post-btn, .view-full-post-link').forEach(button => {
        button.addEventListener('click', (event) => {
          event.preventDefault(); // Prevent link navigation if it's an <a> tag
          const postId = button.getAttribute('data-post-id');
          if (postId) {
            fetchAndDisplayPostDetails(postId); // Call existing function to show full details
          }
        });
      });
    } 
    catch (error) {
      console.error("Error fetching details for author", authorName, ":", error);
      container.innerHTML = `<p>Error fetching details for ${authorName}. Check console for details.</p>`;
    }
  }

  // ---------------------------------------------
  // NEW: KEYWORD SEARCH FUNCTIONALITY
  // ---------------------------------------------

  // Function to highlight keyword in text
  function highlightKeyword(text, keyword) {
    if (!text || !keyword) return text;
    try {
      // Use RegExp for case-insensitive highlighting of the whole word/phrase
      const regex = new RegExp(`(${keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'); 
      return text.replace(regex, '<mark>$1</mark>');
    } 
    catch (e) {
      console.error("Regex error during highlighting:", e);
      // Fallback to simple includes highlighting if regex fails
      const lowerText = text.toLowerCase();
      const lowerKeyword = keyword.toLowerCase();
      let startIndex = lowerText.indexOf(lowerKeyword);
      if (startIndex === -1) return text;
      let result = text.substring(0, startIndex) + 
        '<mark>' + text.substring(startIndex, startIndex + keyword.length) + '</mark>' +
        text.substring(startIndex + keyword.length);
      return result; // Only highlights first instance in fallback
    }
  }

  // ---------------------------------------------
  // Main "updateCharts" logic
  // ---------------------------------------------
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

      // Render charts
      renderSentimentPieChart(allPostsData);
      renderWeightedSentimentChart(allPostsData);
      renderSentimentStackChart(allPostsData);
      renderEngagementScoreChart(allPostsData);
      renderCommentsCountChart(allPostsData);

      // Time Series
      const tsData = await fetchTimeSeriesData();
      renderTimeSeriesChart(tsData);

      // Default post list = "lowestRaw"
      postListDropdown.value = 'lowestRaw';
      renderPostList(allPostsData, 'lowestRaw');

      // Re-render the currently active tab
      const activeTabId = document.querySelector('.tab-button.active').getAttribute('data-tab');
      if (activeTabId === 'weightedTab') {
        renderWeightedSentimentChart(allPostsData);
      } 
      else if (activeTabId === 'stackedTab') {
        renderSentimentStackChart(allPostsData);
      } 
      else if (activeTabId === 'engagementTab') {
        renderEngagementScoreChart(allPostsData);
      } 
      else if (activeTabId === 'totalCommentsTab') {
        renderCommentsCountChart(allPostsData);
      } 
      else if (activeTabId === 'timeSeriesTab') {
        renderTimeSeriesChart(tsData);
      }
    } 
    catch (error) {
      console.error("Error building charts:", error);
    }
  }

  // Function to perform search across posts and comments
  async function searchByKeyword() {
    const keyword = keywordInput.value.trim();
    if (!keyword) {
      postDetailsContainer.innerHTML = "<p>Please enter a keyword to search.</p>";
      return;
    }

    postDetailsContainer.innerHTML = `<p>Searching for "${keyword}"...</p>`;

    const subredditSelect = document.getElementById('subreddit-select');
    const selectedSubreddit = subredditSelect.value;
    const lowerSub = selectedSubreddit.toLowerCase();
    const postsCollectionName = (lowerSub === "temasekpoly") ? "posts" : `${lowerSub}_posts`;
    const lowerKeyword = keyword.toLowerCase();

    let matchingPosts = [];
    let matchingComments = []; // Will store { commentData, postId, postTitle }

    try {
      // Strategy: Fetch all posts within the date range (simpler than complex backend search)
      // Note: This might be slow for very large date ranges/subreddits.
      // Consider adding limits or using a backend search service for production.
      const startDateValue = document.getElementById('start-date').value;
      const endDateValue = document.getElementById('end-date').value;
      const startDate = new Date(startDateValue);
      const endDate = new Date(endDateValue);
      endDate.setHours(23, 59, 59, 999);

      let postsQuery = query(collection(db, postsCollectionName),
          orderBy('created', 'desc'), // Keep ordering consistent
          where('created', '>=', startDate),
          where('created', '<=', endDate)
      );

      const postsSnapshot = await getDocs(postsQuery);
      console.log(`Keyword search: Found ${postsSnapshot.size} posts in date range.`);

      const commentFetchPromises = [];

      postsSnapshot.forEach(postDoc => {
        const postData = postDoc.data();
        const postId = postDoc.id;
        const postTitle = postData.title || "No Title";
        const postBody = postData.body || "";

        let postMatches = false;
        // Check if post title or body matches
        if (postTitle.toLowerCase().includes(lowerKeyword) || postBody.toLowerCase().includes(lowerKeyword)) {
          matchingPosts.push({ postId, ...postData });
          postMatches = true; // Mark post as matched
        }

        // Regardless of post match, check its comments - queue fetch promise
        const commentsRef = collection(db, postsCollectionName, postId, 'comments');
        commentFetchPromises.push(
          getDocs(commentsRef).then(commentsSnapshot => {
            let commentsForThisPost = [];
            commentsSnapshot.forEach(commentDoc => {
              const commentData = commentDoc.data();
              const commentBody = commentData.body || "";
              if (commentBody.toLowerCase().includes(lowerKeyword)) {
                  commentsForThisPost.push({ commentData, commentId: commentDoc.id, postId, postTitle });
              }
            });
            return commentsForThisPost; // Return matched comments for this post
          }).catch(error => {
            console.error(`Error fetching comments for post ${postId}:`, error);
            return []; // Return empty array on error for this post's comments
          })
        );
      });

      // Wait for all comment fetches to complete
      const commentsResults = await Promise.all(commentFetchPromises);
      
      // Flatten the results from comment fetches
      commentsResults.forEach(postComments => {
          matchingComments.push(...postComments);
      });

      displaySearchResults(keyword, matchingPosts, matchingComments);
    } 
    catch (error) {
      console.error("Error during keyword search:", error);
      postDetailsContainer.innerHTML = `<p>An error occurred during the search. Please check the console.</p>`;
    }
  }

  // Function to display search results
 function displaySearchResults(keyword, posts, comments) {
  const postDetailsContainer = document.getElementById('post-details'); // Ensure this is defined in the scope

  // Styled message for no results
  if (posts.length === 0 && comments.length === 0) {
      postDetailsContainer.innerHTML = `
        <div class="search-results-wrapper" style="padding: 25px 30px; background-color: #f8f9fa; border-radius: 10px; border: 1px solid #dee2e6;">
          <h2 style="margin-top: 0; margin-bottom: 15px; font-size: 1.6em; color: #495057;">Search Results</h2>
          <p style="color: #6c757d; font-size: 1.1em;">No posts or comments found matching "<strong>${keyword}</strong>".</p>
        </div>`;
      return;
  }

  // Start building HTML with an outer wrapper and main heading
  let html = `
    <div class="search-results-wrapper" style="padding: 25px 30px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e7eaf3;">
      <h2 style="margin-top: 0; margin-bottom: 25px; font-size: 1.8em; color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 10px;">
        Search Results for "${keyword}"
      </h2>
  `;

  // --- Display matching posts ---
  if (posts.length > 0) {
      html += `<h3 style="margin-top: 0; margin-bottom: 15px; color: #34495e; font-size: 1.4em;">Matching Posts (${posts.length}):</h3>`;
      posts.forEach(postData => {
          const postId = postData.postId; // Ensure postId is available directly if not add it during search collection
          const postTitle = postData.title || "No Title";
          const postBody = postData.body || "";
          const author = postData.author || 'Unknown';
          let date = new Date(); // Fallback
          if (postData.created?.toDate) date = postData.created.toDate();
          else if (postData.created) try { date = new Date(postData.created); } catch(e) {}
          const formattedDate = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); // Removed time for list view
          const url = postData.URL || '#';

          // Card styling for each post result
          html += `
            <div class="search-result-post search-item-card" style="background-color: #fdfdfe; border: 1px solid #e9ecef; border-radius: 8px; padding: 15px 20px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
              <h4 style="margin-top: 0; margin-bottom: 5px; font-size: 1.2em;">
                <a href="${url}" target="_blank" style="color: #2980b9; text-decoration: none; hover:{text-decoration: underline;}">${highlightKeyword(postTitle, keyword)}</a>
              </h4>
              <p style="font-size: 0.85em; color: #7f8c8d; margin-bottom: 15px;">By <strong>${author}</strong> on ${formattedDate}</p>
              <p style="font-size: 0.95em; color: #34495e; line-height: 1.6; margin-bottom: 15px;">
                ${highlightKeyword(postBody, keyword) || '<i>No body content</i>'}
              </p>
              <div style="margin-bottom: 10px;">${generateBadgesHtml(postData)}</div>
              <button class="view-full-post-btn" data-post-id="${postId}" style="margin-top: 5px; padding: 6px 14px; font-size: 0.9em; background-color: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.2s ease;">
                View Full Post
              </button>
            </div>
          `;
      });
  }

  // --- Display matching comments ---
  if (comments.length > 0) {
      // Add separator if posts were also shown
      const separatorStyle = posts.length > 0 ? 'border-top: 1px solid #eee; padding-top: 25px; margin-top: 30px;' : 'margin-top: 0;';
      html += `<h3 style="${separatorStyle} margin-bottom: 15px; color: #34495e; font-size: 1.4em;">Matching Comments (${comments.length}):</h3>`;

      comments.forEach(commentInfo => {
          const commentData = commentInfo.commentData;
          const commentBody = commentData.body || "";
          const author = commentData.author || 'Unknown';
          let date = new Date(); // Fallback
          if (commentData.created?.toDate) date = commentData.created.toDate();
          else if (commentData.created) try { date = new Date(commentData.created); } catch(e) {}
          const formattedDate = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); // Removed time for list view
          const commentPostId = commentInfo.postId; // postId of the parent post
          const parentPostTitle = commentInfo.postTitle || 'Untitled Post'; // Title of the parent post

          const commentBadges = generateCommentBadgesHtml(commentData);

          // Card styling for each comment result
          html += `
            <div class="search-result-comment search-item-card" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <p style="font-size: 0.85em; color: #6b7280; margin-bottom: 8px;">
                    Comment by <strong>${author}</strong> on ${formattedDate}
                    (in post: <span style="font-style: italic;">"${parentPostTitle}"</span>) {/* Display parent post title */}
                </p>
                <p style="font-size: 0.95em; color: #1f2937; line-height: 1.6; margin-bottom: 10px;">
                    ${highlightKeyword(commentBody, keyword) || '<i>No comment body.</i>'}
                </p>
                <div style="margin-bottom: 10px;">${commentBadges}</div>
                <button class="view-full-post-btn" data-post-id="${commentPostId}" style="margin-top: 5px; padding: 6px 14px; font-size: 0.9em; background-color: #5dade2; color: white; border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.2s ease;">
                    View Post Thread
                </button>
            </div>
          `;
      });
    }

    // Close the main wrapper div
    html += `</div>`;

    postDetailsContainer.innerHTML = html;

    // Re-Add event listeners for the dynamically added "View Full Post" buttons
    postDetailsContainer.querySelectorAll('.view-full-post-btn').forEach(button => { // Only need button selector
        button.addEventListener('click', (event) => {
            // event.preventDefault(); // Not needed for button
            const postId = button.getAttribute('data-post-id');
            if (postId) {
                fetchAndDisplayPostDetails(postId); // Call existing function to show full details
            } else {
                console.error("Missing data-post-id attribute on button:", button);
            }
        });
    });
  }

  // Function to display search results
  function displaySearchResults_old_styling(keyword, posts, comments) {
    if (posts.length === 0 && comments.length === 0) {
      postDetailsContainer.innerHTML = `<p>No posts or comments found matching "${keyword}".</p>`;
      return;
    }

    let html = `<h2>Search Results for "${keyword}"</h2>`;

    // Display matching posts
    if (posts.length > 0) {
      html += `<h3>Matching Posts (${posts.length})</h3>`;
      posts.forEach(postData => {
        const postTitle = postData.title || "No Title";
        const postBody = postData.body || "";
        const author = postData.author || 'Unknown';
         let date = new Date(); // Fallback
         if (postData.created && postData.created.toDate) {
            date = postData.created.toDate();
         } 
         else if (postData.created) {
          try { 
            date = new Date(postData.created); 
          } 
          catch(e) {}
         }
        const formattedDate = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const url = postData.URL || '#';

        html += `
          <div class="search-result-post" style="border: 1px solid #ddd; padding: 10px; margin-bottom: 15px;">
            <h4><a href="${url}" target="_blank">${highlightKeyword(postTitle, keyword)}</a></h4>
            <p style="font-size: 0.8em; color: #555;">By ${author} on ${formattedDate}</p>
            <p>${highlightKeyword(postBody, keyword)}</p>
            ${generateBadgesHtml(postData)}
            <button class="view-full-post-btn" data-post-id="${postData.postId}" style="margin-top: 5px; padding: 3px 8px; font-size: 0.8em;">
              View Full Post & Comments
            </button>
          </div>
        `;
      });
    }

    // Display matching comments
    if (comments.length > 0) {
      html += `<h3>Matching Comments (${comments.length})</h3>`;
      comments.forEach(commentInfo => {
        const commentData = commentInfo.commentData;
        const commentBody = commentData.body || "";
        const author = commentData.author || 'Unknown';
        let date = new Date(); // Fallback
        if (commentData.created && commentData.created.toDate) {
          date = commentData.created.toDate();
        } 
        else if (commentData.created) {
          try { 
            date = new Date(commentData.created); 
          } 
          catch(e) {}
        }
        const formattedDate = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        html += `
          <div class="search-result-comment" style="border: 1px solid #eee; padding: 10px; margin-bottom: 10px; background-color: #f9f9f9;">
            <p style="font-size: 0.8em; color: #555;">Comment by ${author} on ${formattedDate} (in post: <a href="#" class="view-full-post-link" data-post-id="${commentInfo.postId}">${commentInfo.postTitle}</a>)</p>
            <p>${highlightKeyword(commentBody, keyword)}</p>
            ${generateCommentBadgesHtml(commentData)}
            <button class="view-full-post-btn" data-post-id="${commentInfo.postId}" style="margin-top: 5px; padding: 3px 8px; font-size: 0.8em;">
              View Full Post & Comments
            </button>            
          </div>
        `;
      });
    }

    postDetailsContainer.innerHTML = html;

    // Add event listeners for the "View Full Post" buttons/links
    postDetailsContainer.querySelectorAll('.view-full-post-btn, .view-full-post-link').forEach(button => {
      button.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent link navigation if it's an <a> tag
        const postId = button.getAttribute('data-post-id');
        if (postId) {
          fetchAndDisplayPostDetails(postId); // Call existing function to show full details
        }
      });
    });
  }

  // Helper function to generate badges HTML for a post (similar to fetchAndDisplayPostDetails)
  function generateBadgesHtml(postData) {
    const category = postData.category || 'N/A';
    const emotion = postData.emotion || 'N/A';
    const engagementScore = postData.engagementScore ?? 0;
    const score = postData.score ?? 0;
    const totalNegativeSentiments = postData.totalNegativeSentiments || 0;
    const totalPositiveSentiments = postData.totalPositiveSentiments || 0;
    const weightedSentimentScore = postData.weightedSentimentScore ?? 0;
    const safeNumberStr = engagementScore.toFixed(2);

    // Ensure values are strings before replacing hyphens for badge URLs
    const scoreStr = score.toString();
    const negSentStr = totalNegativeSentiments.toString();
    const weightSentStr = weightedSentimentScore.toFixed(2).toString();

    return `
      <div class="shields-container" style="margin-top: 5px;">
        <img src="https://img.shields.io/badge/reddit_score-${encodeURIComponent(scoreStr.replace(/-/g, '--'))}-brightgreen?style=flat-square" alt="Reddit Score">
        <img src="https://img.shields.io/badge/positive_sentiments-${totalPositiveSentiments}-green?style=flat-square" alt="Positive">
        <img src="https://img.shields.io/badge/negative_sentiments-${encodeURIComponent(negSentStr.replace(/-/g, '--'))}-red?style=flat-square" alt="Negative">
        <img src="https://img.shields.io/badge/weighted_sentiment-${encodeURIComponent(weightSentStr.replace(/-/g, '--'))}-blueviolet?style=flat-square" alt="Weighted">
        <img src="https://img.shields.io/badge/category-${encodeURIComponent(category)}-blue?style=flat-square" alt="Category">
        <img src="https://img.shields.io/badge/emotion-${encodeURIComponent(emotion)}-purple?style=flat-square" alt="Emotion">
        <img src="https://img.shields.io/badge/engagement-${encodeURIComponent(safeNumberStr)}-orange?style=flat-square" alt="Engagement">
      </div>
    `;
  }

  // // Helper function to generate badges HTML for a comment
  // function generateCommentBadgesHtml(commentData) {
  //   const sentiment = commentData.sentiment ?? 0;
  //   let sentimentColor = 'orange';
  //   if (sentiment < 0) sentimentColor = 'red';
  //   else if (sentiment > 0) sentimentColor = 'green';
  //   const score = commentData.score ?? 0;
  //   const emotion = commentData.emotion || 'N/A';

  //   // Ensure values are strings for badge URLs
  //   const scoreStr = score.toString();
  //   const sentimentStr = sentiment.toFixed(2).toString(); // Use toFixed for consistency

  //   return `
  //     <div class="shields-container" style="margin-top: 5px;">
  //       <img src="https://img.shields.io/badge/reddit_score-${encodeURIComponent(scoreStr.replace(/-/g, '--'))}-brightgreen?style=flat-square" alt="Reddit Score">
  //       <img src="https://img.shields.io/badge/sentiment-${encodeURIComponent(sentimentStr.replace(/-/g, '--'))}-${sentimentColor}?style=flat-square" alt="Sentiment">
  //       <img src="https://img.shields.io/badge/emotion-${encodeURIComponent(emotion)}-purple?style=flat-square" alt="Emotion">
  //     </div>
  //   `;
  // }

  // Helper function to format the value string for the badge
  // Ensures the string is exactly 'width' characters long.
  // Truncates if too long, pads with underscores on the left if too short (for right-align effect in shields.io).
  function formatBadgeValue(valueStr, width = 4) {
    let formatted = valueStr;

    // Truncate if longer than width
    if (formatted.length > width) {
      // Prioritize keeping the sign and initial digits
      formatted = formatted.substring(0, width);
    }

    // Pad with underscore on the left to achieve desired width and right-alignment effect
    // Underscores generally render as spaces in shields.io badges
    formatted = formatted.padStart(width, '\u00A0');

    return formatted;
  }


  // Helper function to generate badges HTML for a comment
  function generateCommentBadgesHtml(commentData) {
    const sentiment = commentData.sentiment ?? 0;
    let sentimentColor = 'yellow';
    if (sentiment < 0) sentimentColor = 'red';
    else if (sentiment > 0) sentimentColor = 'green';
    const score = commentData.score ?? 0;
    const emotion = commentData.emotion || 'N/A';

    // Convert to initial strings
    const scoreStr = score.toString();
    // Keep reasonable precision for sentiment before formatting
    const sentimentStr = sentiment.toString();

    // --- Apply 4-character formatting ---
    const formattedScore = formatBadgeValue(scoreStr, 4);
    const formattedSentiment = formatBadgeValue(sentimentStr, 4);
    // --- End formatting ---

    // Prepare for URL: encode URI components and replace hyphens AFTER formatting
    // Shields.io uses '--' to represent a literal hyphen in the text part.
    const urlEncodedScore = encodeURIComponent(formattedScore.replace(/-/g, '--'));
    const urlEncodedSentiment = encodeURIComponent(formattedSentiment.replace(/-/g, '--'));
    // Emotion doesn't need special formatting, just encoding
    const urlEncodedEmotion = encodeURIComponent(emotion);

    return `
      <div class="shields-container" style="margin-top: 5px;">
        <img src="https://img.shields.io/badge/reddit_score-${urlEncodedScore}-brightgreen?style=flat-square" alt="Reddit Score">
        <img src="https://img.shields.io/badge/sentiment-${urlEncodedSentiment}-${sentimentColor}?style=flat-square" alt="Sentiment">
        <img src="https://img.shields.io/badge/emotion-${urlEncodedEmotion}-purple?style=flat-square" alt="Emotion">
      </div>
    `;
  }

  // 10. Filter button
  document.getElementById('filter-btn').addEventListener('click', updateCharts);

  // NEW: Search button listener
  searchButton.addEventListener('click', searchByKeyword);

  // NEW: Allow pressing Enter in keyword input to trigger search
  keywordInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault(); // Prevent potential form submission
      searchByKeyword();
    }
  });

  // 11. Initial load
  updateCharts();

  // 12. Tab switching
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none';
      });
      button.classList.add('active');
      const activeTab = document.getElementById(tabId);
      activeTab.classList.add('active');
      activeTab.style.display = 'block';

      if (tabId === 'stackedTab') {
        renderSentimentStackChart(allPostsData);
      } 
      else if (tabId === 'weightedTab') {
        renderWeightedSentimentChart(allPostsData);
      } 
      else if (tabId === 'engagementTab') {
        renderEngagementScoreChart(allPostsData);
      } 
      else if (tabId === 'totalCommentsTab') {
        renderCommentsCountChart(allPostsData);
      } 
      else if (tabId === 'authorsTab') {
        updateAuthorsChart();
      } 
      else if (tabId === 'timeSeriesTab') {
        updateTimeSeriesChart();
      }
    });
  });

  // Set default active tab on load
  document.querySelector('.tab-button.active').click();

  // Reset Zoom Buttons
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

  // Listen for subreddit dropdown changes
  document.getElementById('subreddit-select').addEventListener('change', () => {
    // Optional: Show/hide checkboxes
    const selectedSub = document.getElementById('subreddit-select').value.toLowerCase();
    const iitBox = document.getElementById('iit-filter');
    const tpRelatedBox = document.getElementById('tp-related-filter');

    if (selectedSub === 'temasekpoly') {
      iitBox.style.display = 'inline-block';
      tpRelatedBox.style.display = 'none';
    } 
    else {
      iitBox.style.display = 'none';
      tpRelatedBox.style.display = 'inline-block';
    }

    updateCharts();
  });

  // On load, hide the TP-Related filter if we start with TemasekPoly
  if (document.getElementById('subreddit-select').value.toLowerCase() === 'temasekpoly') {
    document.getElementById('tp-related-filter').style.display = 'none';
  }
  
  const subredditSelect = document.getElementById("subreddit-select");
  const iitFilter = document.getElementById("iit-filter");
  const tpRelatedFilter = document.getElementById("tp-related-filter");
  // Get the labels associated with the checkboxes

  const iitLabel = document.querySelector('label[for="iit-filter"]');
  const tpLabel = document.querySelector('label[for="tp-related-filter"]');
  
  function updateFilters() {
    // When "TemasekPoly" is selected, show IIT filter and hide TP-Related filter
    if (subredditSelect.value === "TemasekPoly") {
      if (iitFilter) { iitFilter.style.display = "inline-block"; }
      if (iitLabel) { iitLabel.style.display = "inline-block"; }
      if (tpRelatedFilter) { tpRelatedFilter.style.display = "none"; }
      if (tpLabel) { tpLabel.style.display = "none"; }
    } 
    else {
      // For other subreddits, hide IIT filter and show TP-Related filter
      if (iitFilter) { iitFilter.style.display = "none"; }
      if (iitLabel) { iitLabel.style.display = "none"; }
      if (tpRelatedFilter) { tpRelatedFilter.style.display = "inline-block"; }
      if (tpLabel) { tpLabel.style.display = "inline-block"; }
    }
  }

  updateFilters();
  // Update filters (and charts) when the subreddit selection changes
  subredditSelect.addEventListener("change", () => {
    updateFilters();
    updateCharts(); // This will re-run your chart updates
  });
});

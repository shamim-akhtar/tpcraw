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

// console.log("Script is loaded and running.");

const MAX_LABEL_LENGTH = 30;

document.addEventListener('DOMContentLoaded', async () => {
  // --- 1. DRAWER ELEMENTS ---
  const drawer = document.getElementById('post-details-container');
  const overlay = document.getElementById('drawer-overlay');

  function openDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('active');
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('active');
  }

  // Close drawer when clicking the overlay
  overlay.addEventListener('click', closeDrawer);

  // --- 1. SET DYNAMIC DATE RANGE (6 MONTHS) ---
  const startDateInput = document.getElementById('start-date');
  const endDateInput = document.getElementById('end-date');

  // Set End Date to Today
  const today = new Date();
  endDateInput.value = today.toISOString().split('T')[0];

  // Calculate Start Date (6 Months Ago)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(today.getMonth() - 6);
  
  // Format to YYYY-MM-DD and set value
  startDateInput.value = sixMonthsAgo.toISOString().split('T')[0];

  // 2. Firebase config
  const firebaseConfig = {
    apiKey: "AIzaSyByJtrvblZlThYxcL57BQReT3Tk48CjnBA", // Consider securing this
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
  let timeSeriesChart = null;

  // 6. Global array to store fetched posts
  let allPostsData = [];

  // 7. Get references to new search elements
  const keywordInput = document.getElementById('keyword-search');
  const searchButton = document.getElementById('search-btn');
  const postDetailsContainer = document.getElementById('post-details'); // Reference to the display area

  //--------------------TABS
  const tabs = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content'); // Ensure tab content elements have this class
  const tabContainer = document.querySelector('.tab-container'); // Parent for event delegation

  // Function to switch tabs
  function switchTab(event) {
      // Check if the clicked element is a tab button
      if (!event.target.classList.contains('tab-button')) return;

      const targetTab = event.target.dataset.tab;

      // Update button styles
      tabs.forEach(button => {
          button.classList.remove('active');
          // CSS will handle the active state styles (.tab-button.active)
      });
      event.target.classList.add('active');

      // Hide all content sections
      tabContents.forEach(content => {
          content.classList.remove('active'); // Use class to control display
      });

      // Show the target content section
      const activeContent = document.getElementById(targetTab);
      if (activeContent) {
        activeContent.classList.add('active'); // Use class to control display

        // --- FIX: Call resize() on the specific chart AFTER its container is visible ---
        try {
          if (targetTab === 'weightedTab' && weightedSentimentChart) {
            weightedSentimentChart.resize();
          }
          else if (targetTab === 'stackedTab' && commentsSentimentChart) {
            commentsSentimentChart.resize();
          }
          else if (targetTab === 'totalCommentsTab' && totalCommentsChart) {
            totalCommentsChart.resize();
          }
          else if (targetTab === 'engagementTab' && engagementScoreChart) {
            engagementScoreChart.resize();
          }
          else if (targetTab === 'authorsTab' && window.authorsChartInstance) {
            if(window.authorsChartInstance) window.authorsChartInstance.resize();
          }
          else if (targetTab === 'timeSeriesTab' && timeSeriesChart) {
            timeSeriesChart.resize();
          }
        }
        catch (err) {
            console.error("Error resizing chart:", err);
        }

      }
      else {
          console.warn(`Tab content not found for id: ${targetTab}`);
      }
  }

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
        initialContent.classList.add('active'); // Use class
      }
  }

  // Note: Hover effects are better handled purely in CSS with :hover pseudo-class
  // Removing JS hover effects for tabs and reset buttons as they should be in CSS.

  // --------------------------------------------------------------
  // FETCH FIRESTORE POSTS - with filters for subreddit & checkboxes
  // --------------------------------------------------------------
  async function fetchPostsInRange() {
    // console.log("fetchPostsInRange() called");

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

    // console.log("Selected subreddit:", selectedSubreddit);
    // console.log("Using posts collection:", postsCollection);

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
        // console.log("IIT filter applied: iit == yes");
      }
    }
    // Otherwise, for non-TemasekPoly subreddits, use the "relatedToTemasekPoly" filter if checked
    else if(lowerSub === "sgexams"){
      if (isTpRelatedChecked) {
        q = query(q, where('relatedToTemasekPoly', '==', true));
        // console.log("TP-related filter applied: relatedToTemasekPoly == true");
      }
    }

    // Now fetch posts
    const snapshot = await getDocs(q);
    // console.log("Fetched posts, snapshot size:", snapshot.size);

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
        postDetails: postData // Keep full data for details view
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

    ctx.canvas.width = 260; // Keep explicit sizing if needed for layout
    ctx.canvas.height = 260;

    window.sentimentPieChartInstance = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Positive', 'Neutral', 'Negative'],
        datasets: [{
          data: [positivePercent, neutralPercent, negativePercent],
          backgroundColor: ['#4CAF50', '#FFC107', '#F44336'], // Colors remain hardcoded here as they are chart data
        }]
      },
      options: {
        responsive: false, // Keep false if explicit size is intended
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
        // Keep label truncation logic
        if (title.length > MAX_LABEL_LENGTH) {
            return title.slice(0, MAX_LABEL_LENGTH) + '…';
        } else {
            // Padding logic might be better handled via CSS if possible, but keep if needed
            return title.padStart(MAX_LABEL_LENGTH, ' ');
        }
    });
    const weightedScores = data.map(item => item.weightedSentimentScore);

    // Bar color logic remains in JS as it's data-dependent
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
                backgroundColor: backgroundColors // Use dynamic colors
            }]
        },
        options: { // Chart options remain largely the same
            responsive: true,
            plugins: {
                title: { // Title styling can often be done via Chart.js options
                    display: true,
                    text: 'Weighted Sentiment Breakdown by Post',
                    align: 'start',
                    font: { size: 18, weight: '600', family: 'Arial, sans-serif' },
                    color: '#333',
                    padding: { top: 10, bottom: 20 }
                },
                zoom: { // Zoom plugin configuration
                    pan: { enabled: true, mode: 'x', modifierKey: 'ctrl' },
                    zoom: { drag: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                }
            },
            scales: {
                x: { ticks: { maxRotation: 60, minRotation: 60, align: 'center' } },
                y: { beginAtZero: true }
            },
            onClick: (evt, elements) => { // Click handler remains
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
  // Chart 3: RAW SENTIMENT STACK (Stacked Sentiment)
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
                      backgroundColor: 'rgba(75, 192, 192, 0.8)', // Color part of data config
                      stack: 'Stack 0'
                  },
                  {
                      label: 'Negative Sentiments',
                      data: negativeData,
                      backgroundColor: 'rgba(255, 99, 132, 0.8)', // Color part of data config
                      stack: 'Stack 0'
                  }
              ]
          },
          options: { // Options remain largely the same
              responsive: true,
              interaction: {
                  mode: 'index', // This detects clicks anywhere on the vertical axis of the bar
                  intersect: false // Allows clicking even if the mouse isn't directly touching a colored bar
              },
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
                      pan: { enabled: true, mode: 'x', modifierKey: 'ctrl' },
                      zoom: { drag: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                  }
              },
              scales: {
                  x: { stacked: true, ticks: { maxRotation: 60, minRotation: 60, align: 'center' } },
                  y: { stacked: true, beginAtZero: true }
              },
              onClick: (evt, elements) => { // Click handler remains
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

      // Color remains here
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
          options: { // Options remain largely the same
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
                      pan: { enabled: true, mode: 'x', modifierKey: 'ctrl' },
                      zoom: { drag: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                  }
              },
              scales: {
                  x: { ticks: { maxRotation: 60, minRotation: 60, align: 'center' } },
                  y: { beginAtZero: true }
              },
              onClick: (evt, elements) => { // Click handler remains
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

      // Color remains here
      const backgroundColors = totalComments.map(() => 'rgba(153, 102, 255, 0.8)'); // Consider a different color?

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
          options: { // Options remain largely the same
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
                      pan: { enabled: true, mode: 'x', modifierKey: 'ctrl' },
                      zoom: { drag: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                  }
              },
              scales: {
                  x: { ticks: { maxRotation: 60, minRotation: 60, align: 'center' } },
                  y: { beginAtZero: true }
              },
              onClick: (evt, elements) => { // Click handler remains
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
    // Open the drawer immediately
    openDrawer();
    
    const postDetailsContent = document.getElementById('post-details');
    postDetailsContent.innerHTML = '<p class="loading-message">Loading post details...</p>';

    const subredditSelect = document.getElementById('subreddit-select');
    const selectedSubreddit = subredditSelect.value;
    const lowerSub = selectedSubreddit.toLowerCase();
    const postsCollection = (lowerSub === "temasekpoly") ? "posts" : `${lowerSub}_posts`;

    const postRef = doc(db, postsCollection, postId); // Uses local 'db' instance
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
        postDetailsContent.innerHTML = `<div class="details-message error">No details available.</div>`;
        return;
    }

    const postData = postSnap.data();

    // --- Extract Data ---
    const postTitle = postData.title || "No Title";
    const author = postData.author || 'Unknown';
    const postUrl = postData.URL || '#';
    const date = postData.created?.toDate ? postData.created.toDate() : (postData.created ? new Date(postData.created) : new Date());
    const formattedDate = date.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
    }).replace(',', '');

    // --- Build HTML Sections (Removed inline styles, using classes) ---

    // 1. Title Section
    const urlHtml = `
        <h2 class="post-details-title">
            <a href="${postUrl}" target="_blank">
                ${postTitle}
            </a>
        </h2>`;

    // 2. Metadata Section
    const metaHtml = `
        <p class="post-details-meta">
            Posted by <strong>${author}</strong> on ${formattedDate}
        </p>`;

    // 3. Badges Section
    const badgesHtml = `
        <div class="post-details-badges">
            ${generateBadgesHtml(postData)}
        </div>`;

    // 4. Summary Section
    const summaryHtml = `
      <div class="post-details-summary">
        <h4 class="summary-title">
            💡 AI Generated Summary & Analysis
        </h4>
        <p class="summary-text">
            ${postData.summary || '<i>No summary provided.</i>'}
        </p>
      </div>`;

    // 5. Body Section
    const bodyHtml = `
      <div class="post-details-body-container">
        <h4 class="body-title">Original Post Content:</h4>
        <div class="body-content">
            ${postData.body || '<i>No body content provided.</i>'}
        </div>
      </div>`;

    // 6. Comments Section
    const commentsRef = collection(db, `${postsCollection}/${postId}/comments`);
    const commentsSnapshot = await getDocs(commentsRef);

    let commentsHtml = `
        <h3 class="post-details-comments-title">
            Comments (${commentsSnapshot.size}):
        </h3>`;

    if (commentsSnapshot.size === 0) {
        commentsHtml += `<p class="no-comments-message">No comments available.</p>`;
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

            const commentBadges = generateCommentBadgesHtml(commentData); // Assumes this generates HTML with classes now

            commentsHtml += `
              <div class="post-details-comment">
                  <p class="comment-meta">
                      Comment by <strong>${commentAuthor}</strong> on ${formattedCommentDate}
                  </p>
                  <p class="comment-body">
                      ${commentData.body || '<i>No comment body.</i>'}
                  </p>
                  <div class="comment-badges">${commentBadges}</div>
              </div>
            `;
        });
    }

    // Assemble Final HTML with the Close Button
    const closeBtnHtml = `<button class="close-drawer-btn" id="closeDrawerX">✕ Close</button>`;
    
    postDetailsContent.innerHTML = `
      <div class="post-details-wrapper">
          ${closeBtnHtml}
          ${urlHtml}
          ${metaHtml}
          ${badgesHtml}
          ${summaryHtml}
          ${bodyHtml}
          ${commentsHtml}
      </div>`;

    // Attach the close listener to the new button
    document.getElementById('closeDrawerX').addEventListener('click', closeDrawer);
  }

  async function fetchAndDisplayPostDetails_old(postId) {
    const postDetailsContainer = document.getElementById('post-details');
    postDetailsContainer.innerHTML = '<p class="loading-message">Loading post details...</p>'; // Add class for styling

    // Identify the posts collection
    const subredditSelect = document.getElementById('subreddit-select');
    const selectedSubreddit = subredditSelect.value;
    const lowerSub = selectedSubreddit.toLowerCase();
    const postsCollection = (lowerSub === "temasekpoly") ? "posts" : `${lowerSub}_posts`;

    const postRef = doc(db, postsCollection, postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
        // Add class for styling
        postDetailsContainer.innerHTML = `<div class="details-message error">No details available for this post.</div>`;
        return;
    }

    const postData = postSnap.data();

    // --- Extract Data ---
    const postTitle = postData.title || "No Title";
    const author = postData.author || 'Unknown';
    const postUrl = postData.URL || '#';
    const date = postData.created?.toDate ? postData.created.toDate() : (postData.created ? new Date(postData.created) : new Date());
    const formattedDate = date.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
    }).replace(',', '');

    // --- Build HTML Sections (Removed inline styles, using classes) ---

    // 1. Title Section
    const urlHtml = `
        <h2 class="post-details-title">
            <a href="${postUrl}" target="_blank">
                ${postTitle}
            </a>
        </h2>`;

    // 2. Metadata Section
    const metaHtml = `
        <p class="post-details-meta">
            Posted by <strong>${author}</strong> on ${formattedDate}
        </p>`;

    // 3. Badges Section
    const badgesHtml = `
        <div class="post-details-badges">
            ${generateBadgesHtml(postData)}
        </div>`;

    // 4. Summary Section
    const summaryHtml = `
      <div class="post-details-summary">
        <h4 class="summary-title">
            💡 AI Generated Summary & Analysis
        </h4>
        <p class="summary-text">
            ${postData.summary || '<i>No summary provided.</i>'}
        </p>
      </div>`;

    // 5. Body Section
    const bodyHtml = `
      <div class="post-details-body-container">
        <h4 class="body-title">Original Post Content:</h4>
        <div class="body-content">
            ${postData.body || '<i>No body content provided.</i>'}
        </div>
      </div>`;

    // 6. Comments Section
    const commentsRef = collection(db, `${postsCollection}/${postId}/comments`);
    const commentsSnapshot = await getDocs(commentsRef);

    let commentsHtml = `
        <h3 class="post-details-comments-title">
            Comments (${commentsSnapshot.size}):
        </h3>`;

    if (commentsSnapshot.size === 0) {
        commentsHtml += `<p class="no-comments-message">No comments available.</p>`;
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

            const commentBadges = generateCommentBadgesHtml(commentData); // Assumes this generates HTML with classes now

            commentsHtml += `
              <div class="post-details-comment">
                  <p class="comment-meta">
                      Comment by <strong>${commentAuthor}</strong> on ${formattedCommentDate}
                  </p>
                  <p class="comment-body">
                      ${commentData.body || '<i>No comment body.</i>'}
                  </p>
                  <div class="comment-badges">${commentBadges}</div>
              </div>
            `;
        });
    }

    // --- Assemble Final HTML in a Styled Container ---
    // Removed inline styles from the wrapper
    postDetailsContainer.innerHTML = `
      <div class="post-details-wrapper">
          ${urlHtml}
          ${metaHtml}
          ${badgesHtml}
          ${summaryHtml}
          ${bodyHtml}
          ${commentsHtml}
      </div>
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
      return `<p class="no-posts-message">No posts found for this filter.</p>`; // Add class
    }
    let html = `
      <table class="post-list-table">
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
      // Removed inline style="cursor: pointer;" - handled by CSS :hover on the class
      html += `
        <tr data-post-id="${p.postId}" class="post-list-row"> 
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
            backgroundColor: 'rgba(75, 192, 192, 0.8)', // Color remains
          },
          {
            label: 'Negative Count',
            data: negativeCounts,
            backgroundColor: 'rgba(255, 99, 132, 0.8)', // Color remains
          }
        ]
      },
      options: { // Options remain
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
          x: { stacked: true, ticks: { maxRotation: 60, minRotation: 60, align: 'center' } },
          y: { stacked: true, beginAtZero: true }
        },
        onClick: (evt, elements) => { // Click handler remains
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
      // Ensure date parsing is robust or adjust based on actual ID format
      if (!isNaN(docDate) && docDate >= startDate && docDate <= endDate) {
        const data = docSnap.data();
        // for (let category in data) {
        //   if (!timeSeriesData[category]) {
        //     timeSeriesData[category] = [];
        //   }
        //   timeSeriesData[category].push({
        //     x: dateStr,
        //     y: data[category].averageSentiment || 0
        //   });
        // }
        for (let originalCategory in data) {
            // --- MODIFICATION START ---
            // Convert the category key from Firestore to lowercase for consistent grouping
            const lowerCaseCategory = originalCategory.toLowerCase();

            // Initialize the array for this lowercase category if it doesn't exist yet
            if (!timeSeriesData[lowerCaseCategory]) {
                timeSeriesData[lowerCaseCategory] = [];
            }

            // Push the data point into the array corresponding to the LOWERCASE category key
            // Retrieve the actual averageSentiment using the ORIGINAL category key from the Firestore data
            timeSeriesData[lowerCaseCategory].push({
                x: dateStr, // Keep the date string
                y: data[originalCategory].averageSentiment || 0 // Use originalCategory to access Firestore data
            });
          // --- MODIFICATION END ---
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
            // Check if dataPoints[j] and its y value exist
            if (dataPoints[j] && typeof dataPoints[j].y === 'number') {
                sum += dataPoints[j].y;
                count++;
            } else {
                // Handle cases where data might be missing or malformed for a point
                // console.warn(`Skipping point in moving average calculation due to missing data: index ${j}`);
            }
        }
        // Only calculate average if count is greater than 0 to avoid division by zero
        let avg = count > 0 ? sum / count : 0; // Default to 0 or handle as needed
        maPoints.push({ x: dataPoints[i].x, y: avg });
    }
    return maPoints;
  }

  function setAlpha(rgba, alpha) {
    if(typeof rgba !== 'string') return 'rgba(0,0,0,0.1)'; // Fallback color
    return rgba.replace(/, ?([\d\.]+)\)/, `, ${alpha})`).replace('rgb(', 'rgba(');
  }

  const PREDEFINED_CATEGORY_COLORS = {
    academic: "rgba(0, 112, 242, 1)",
    exams: "rgba(169, 62, 0, 1)",
    internship: "rgba(93, 193, 34, 1)",
    facilities: "rgba(186, 6, 108, 1)",
    subjects: "rgba(37, 111, 58, 1)",
    administration: "rgba(139, 71, 215, 1)",
    career: "rgba(121, 140, 119, 1)",
    admission: "rgba(170, 8, 8, 1)",
    results: "rgba(71, 12, 237, 1)",
    lecturer: "rgba(218, 108, 108, 1)",
    "student life": "rgba(4, 159, 154, 1)",
    infrastructure: "rgba(77, 182, 172, 1)",
    classroom: "rgba(53, 74, 95, 1)",
    events: "rgba(0, 188, 212, 1)",
    cca: "rgba(120, 0, 164, 1)"
  };

  function getCategoryColor(category) {
    const key = category.toLowerCase();
    return PREDEFINED_CATEGORY_COLORS[key] || "rgba(38, 198, 218, 1)"; // Fallback RGBA
  }

  function renderTimeSeriesChart(data) {
    let datasets = [];
    const initialVisibleCategory = 'academic'; // Define which category is visible initially

    for (let category in data) {
        const color = getCategoryColor(category);
        const isVisible = category.toLowerCase() === initialVisibleCategory;

        // Raw data dataset
        datasets.push({
            label: category + " (raw)",
            data: data[category],
            fill: false,
            borderColor: setAlpha(color, 0.3), // Use alpha function
            tension: 0.1,
            borderWidth: 0.5,
            hidden: !isVisible // Set hidden based on initial visibility
        });

        // 7-day Moving Average dataset
        datasets.push({
            label: category + " (7-day MA)",
            data: computeMovingAverage(data[category], 7),
            fill: false,
            borderColor: color, // Base color
            borderWidth: 2.0,
            tension: 0.5,
            hidden: !isVisible // Set hidden based on initial visibility
        });
    }


    if (timeSeriesChart) {
      timeSeriesChart.destroy();
    }

    const ctx = document.getElementById('timeSeriesChart').getContext('2d');
    timeSeriesChart = new Chart(ctx, {
        type: 'line',
        data: { datasets: datasets },
        options: { // Options remain largely the same
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Time Series of Average Sentiment by Category',
                    align: 'start',
                    font: { size: 18, weight: '600' }
                },
                zoom: {
                    pan: { enabled: true, mode: 'x', modifierKey: 'ctrl' },
                    zoom: { drag: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                },
                tooltip: { mode: 'index', intersect: false },
                legend: { // Legend customization remains
                    labels: {
                        generateLabels: function(chart) {
                            const dsets = chart.data.datasets;
                            const seenCategories = {};
                            const labels = [];
                            dsets.forEach((dataset, i) => {
                                // Extract category name robustly (handle spaces)
                                const labelParts = dataset.label.split(" (");
                                const cat = labelParts[0];
                                if (seenCategories[cat] === undefined) {
                                    seenCategories[cat] = i;
                                    labels.push({
                                        text: cat,
                                        fillStyle: dataset.borderColor,
                                        // Correctly determine hidden status based on the *first* dataset for this category
                                        hidden: !chart.isDatasetVisible(seenCategories[cat]),
                                        datasetIndex: seenCategories[cat] // Point to the first dataset index for this category
                                    });
                                }
                            });
                            labels.sort((a, b) => a.text.localeCompare(b.text));
                            return labels;
                        }
                    },
                     onClick: function(e, legendItem, legend) {
                        const category = legendItem.text; // Use the exact legend text
                        const chart = legend.chart;
                        chart.data.datasets.forEach((dataset, i) => {
                            const dsCategory = dataset.label.split(" (")[0];
                            if (dsCategory === category) {
                                // Toggle visibility for both raw and MA datasets of this category
                                const meta = chart.getDatasetMeta(i);
                                meta.hidden = !legendItem.hidden; // Toggle based on the *clicked* legend item's desired state
                            }
                        });
                        chart.update();
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { parser: 'yyyy-MM-dd', unit: 'day', displayFormats: { day: 'MMM d' } },
                    title: { display: true, text: 'Date' }
                },
                y: {
                    min: -1.2, max: 1.2, beginAtZero: false,
                    title: { display: true, text: 'Average Sentiment' }
                }
            },
            onClick: async (evt, elements) => { // Click handler remains
                if (elements.length > 0) {
                    const element = elements[0];
                    const datasetIndex = element.datasetIndex;
                    const index = element.index;
                    const dataset = timeSeriesChart.data.datasets[datasetIndex];
                    const categoryLabel = dataset.label.split(" (")[0]; // Extract category name
                    const dataPoint = dataset.data[index];
                    if (dataPoint && dataPoint.x) { // Ensure data point exists
                      const dateStr = dataPoint.x;
                      // console.log(`Clicked on Category: ${categoryLabel}, Date: ${dateStr}`);
                      await fetchAndDisplayPostsByCategoryAndDate(categoryLabel, dateStr); // Pass original label
                    } else {
                      console.warn("Clicked element missing data point information.");
                    }
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
  // async function fetchAndDisplayPostsByCategoryAndDate(category, dateStr) { // category is now passed directly
  //     const container = document.getElementById('post-details');
  //     // Use class for loading message
  //     container.innerHTML = `<div class="details-message loading"><i>Loading activity for category "${category}" on ${dateStr}...</i></div>`;

  //     const subredditSelect = document.getElementById('subreddit-select');
  //     const selectedSubreddit = subredditSelect.value;
  //     const lowerSub = selectedSubreddit.toLowerCase();
  //     const postsCollection = (lowerSub === "temasekpoly") ? "posts" : `${lowerSub}_posts`;
  //     const categoryCollection = (lowerSub === "temasekpoly") ? "category_stats" : `${lowerSub}_category_stats`;
  //     const lowerCategory = category.toLowerCase(); // Use lowercase for lookup in statsData
  //     const upperCategory = category.toUpperCase();

  //     try {
  //         const statsDocRef = doc(db, categoryCollection, dateStr);
  //         const statsDocSnap = await getDoc(statsDocRef);

  //         // Use original category casing for display
  //         const formattedCategory = category;

  //         if (!statsDocSnap.exists()) {
  //             // Use class for message
  //             container.innerHTML = `<div class="details-message info">No activity data found for category <strong>${formattedCategory}</strong> on ${dateStr}.</div>`;
  //             return;
  //         }

  //         const statsData = statsDocSnap.data();
  //         // Look up using lowercase category key
  //         if (!statsData || !statsData[lowerCategory] || !statsData[upperCategory]) {
  //             // Use class for message
  //             container.innerHTML = `<div class="details-message info">No posts or comments found specifically for category <strong>${formattedCategory}</strong> on ${dateStr}.</div>`;
  //             return;
  //         }

  //         // Use lowercase category key to access data
  //         const postIds = statsData[lowerCategory].postIds || [];
  //         const commentsMap = statsData[lowerCategory].comments || {};
  //         const totalCommentCount = Object.keys(commentsMap).reduce((acc, key) => acc + commentsMap[key].length, 0);

  //         // --- Pre-fetch Post Titles --- (No style changes needed here)
  //          let postTitlesMap = {};
  //           let uniquePostIdsInComments = Object.keys(commentsMap);
  //           if (uniquePostIdsInComments.length > 0) {
  //               const uniquePostRefs = uniquePostIdsInComments.map(id => doc(db, postsCollection, id));
  //               const parentPostSnaps = await Promise.all(uniquePostRefs.map(ref => getDoc(ref).catch(e => { console.error(`Failed to fetch parent post ${ref.id} for category view`, e); return null; })));
  //               parentPostSnaps.forEach(snap => {
  //                   if (snap && snap.exists()) {
  //                       postTitlesMap[snap.id] = snap.data().title || 'Untitled Post';
  //                   } else if (snap) {
  //                       postTitlesMap[snap.id] = 'Unknown Post (Deleted?)';
  //                   }
  //               });
  //           }
  //         // --- End Pre-fetch ---

  //         // Start building HTML (removed inline styles, using classes)
  //         let html = `
  //           <div class="category-date-details-wrapper">
  //             <h2 class="category-date-title">
  //               Category: <span class="category-name">${formattedCategory}</span> <span class="date-info">on ${dateStr}</span>
  //             </h2>
  //         `;

  //         // --- Display Posts ---
  //         html += `<h3 class="posts-section-title">Posts (${postIds.length}):</h3>`;
  //         if (postIds.length === 0) {
  //             html += `<p class="no-posts-message">No posts found in this category on this date.</p>`;
  //         } else {
  //             const postPromises = postIds.map(postId => getDoc(doc(db, postsCollection, postId)).catch(e => { console.error(`Failed to fetch post ${postId}`, e); return null; }));
  //             const postSnaps = await Promise.all(postPromises);

  //             postSnaps.forEach(postSnap => {
  //                 if (postSnap && postSnap.exists()) {
  //                     const postData = postSnap.data();
  //                     const postId = postSnap.id;
  //                     const postTitle = postData.title || "No Title";
  //                     const postBody = postData.body || "";
  //                     const author = postData.author || 'Unknown';
  //                     const postUrl = postData.URL || '#';
  //                     let date = new Date();
  //                     if (postData.created?.toDate) date = postData.created.toDate();
  //                     else if (postData.created) try { date = new Date(postData.created); } catch (e) {}
  //                     const formattedPostDate = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  //                     // Removed inline styles, added classes
  //                     html += `
  //                       <div class="search-result-post category-post-item">
  //                         <h4 class="post-title">
  //                           <a href="${postUrl}" target="_blank">${postTitle}</a>
  //                         </h4>
  //                         <p class="post-meta">By <strong>${author}</strong> on ${formattedPostDate}</p>
  //                         <p class="post-body-excerpt">
  //                           ${postBody || '<i>No body content</i>'}
  //                         </p>
  //                         <div class="post-badges">${generateBadgesHtml(postData)}</div>
  //                         <button class="view-full-post-btn" data-post-id="${postId}">
  //                           View Full Post
  //                         </button>
  //                       </div>
  //                     `;
  //                 } else {
  //                    // Use class for message
  //                     html += `<div class="details-message error-partial"><em>Post data unavailable or failed to load.</em></div>`;
  //                 }
  //             });
  //         }

  //         // --- Display Comments ---
  //         html += `<h3 class="comments-section-title">Comments (${totalCommentCount}):</h3>`;
  //         if (totalCommentCount === 0) {
  //             html += `<p class="no-comments-message">No comments found in this category on this date.</p>`;
  //         } else {
  //             let commentFetchPromises = [];
  //             for (const postId in commentsMap) {
  //                 commentsMap[postId].forEach(commentId => {
  //                     const commentRef = doc(db, `${postsCollection}/${postId}/comments`, commentId);
  //                     commentFetchPromises.push(getDoc(commentRef).catch(e => { console.error(`Failed to fetch comment ${commentId} in post ${postId}`, e); return null; }));
  //                 });
  //             }
  //             const commentSnaps = await Promise.all(commentFetchPromises);

  //             commentSnaps.forEach(commentSnap => {
  //                 if (commentSnap && commentSnap.exists()) {
  //                     const commentData = commentSnap.data();
  //                     const author = commentData.author || 'Unknown';
  //                     const commentBody = commentData.body || "";
  //                     const commentPostId = commentSnap.ref.parent.parent.id;
  //                     const parentPostTitle = postTitlesMap[commentPostId] || 'Unknown Post';

  //                     let date = new Date();
  //                     if (commentData.created?.toDate) date = commentData.created.toDate();
  //                     else if (commentData.created) try { date = new Date(commentData.created); } catch (e) {}
  //                     const formattedDate = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  //                     const commentBadges = generateCommentBadgesHtml(commentData);

  //                     // Removed inline styles, added classes
  //                     html += `
  //                       <div class="search-result-comment category-comment-item">
  //                           <p class="comment-meta">
  //                               In Post: <span class="parent-post-title">"${parentPostTitle}"</span> (Comment by <strong>${author}</strong> on ${formattedDate})
  //                           </p>
  //                           <p class="comment-body">
  //                               ${commentBody || '<i>No comment body.</i>'}
  //                           </p>
  //                           <div class="comment-badges">${commentBadges}</div>
  //                            <button class="view-full-post-btn" data-post-id="${commentPostId}">
  //                               View Post Thread
  //                            </button>
  //                       </div>
  //                     `;
  //                 } else {
  //                     // Optional: Handle missing comment message
  //                 }
  //             });
  //         }

  //         html += `</div>`; // Close wrapper
  //         container.innerHTML = html;

  //         // Re-Add event listeners
  //         container.querySelectorAll('.view-full-post-btn').forEach(button => {
  //             button.addEventListener('click', (event) => {
  //                 const postId = button.getAttribute('data-post-id');
  //                 if (postId) {
  //                     fetchAndDisplayPostDetails(postId);
  //                 } else {
  //                     console.error("Could not find data-post-id on clicked element:", button);
  //                 }
  //             });
  //         });

  //     } catch (error) {
  //         console.error(`Error fetching details for category ${category} on ${dateStr}:`, error);
  //         // Use class for error message
  //         container.innerHTML = `<div class="details-message error">Error fetching activity details. Please check the console.</div>`;
  //     }
  // } // End of function

  async function fetchAndDisplayPostsByCategoryAndDate(category, dateStr) {
    const container = document.getElementById('post-details');
    // Use original category casing for display messages
    const formattedCategory = category;
    container.innerHTML = `<div class="details-message loading"><i>Loading activity for category "${formattedCategory}" on ${dateStr}...</i></div>`;

    const subredditSelect = document.getElementById('subreddit-select');
    const selectedSubreddit = subredditSelect.value;
    const lowerSub = selectedSubreddit.toLowerCase();
    const postsCollection = (lowerSub === "temasekpoly") ? "posts" : `${lowerSub}_posts`;
    const categoryCollection = (lowerSub === "temasekpoly") ? "category_stats" : `${lowerSub}_category_stats`;

    try {
        const statsDocRef = doc(db, categoryCollection, dateStr);
        const statsDocSnap = await getDoc(statsDocRef);

        if (!statsDocSnap.exists()) {
            container.innerHTML = `<div class="details-message info">No activity data found for date <strong>${dateStr}</strong>. Cannot check category ${formattedCategory}.</div>`;
            return;
        }

        const statsData = statsDocSnap.data();
        if (!statsData) {
            container.innerHTML = `<div class="details-message info">Empty activity data document found for date <strong>${dateStr}</strong>.</div>`;
            return;
        }

        // --- MODIFICATION START: Combine lower and upper case data ---
        const lowerCategory = category.toLowerCase();
        const upperCategory = category.toUpperCase();

        let combinedPostIds = new Set();
        let combinedCommentsTempMap = {}; // Temporary map using Sets for comment IDs to avoid duplicates

        // Function to merge data from a specific category key (lower or upper)
        const mergeCategoryData = (catKey) => {
            if (statsData[catKey]) {
                const categoryData = statsData[catKey];
                // Merge Post IDs
                (categoryData.postIds || []).forEach(id => combinedPostIds.add(id));
                // Merge Comments
                const comments = categoryData.comments || {};
                for (const postId in comments) {
                    if (!combinedCommentsTempMap[postId]) {
                        combinedCommentsTempMap[postId] = new Set();
                    }
                    (comments[postId] || []).forEach(commentId => combinedCommentsTempMap[postId].add(commentId));
                }
            }
        };

        // Merge data for the lowercase version
        mergeCategoryData(lowerCategory);

        // Merge data for the uppercase version *if* it's different from lowercase
        if (lowerCategory !== upperCategory) {
            mergeCategoryData(upperCategory);
        }

        // Convert the combined Sets back into the expected array/object formats
        const postIds = Array.from(combinedPostIds); // Final array of unique post IDs
        const commentsMap = {}; // Final map of { postId: [commentId1, commentId2, ...] }
        let totalCommentCount = 0;
        for (const postId in combinedCommentsTempMap) {
            commentsMap[postId] = Array.from(combinedCommentsTempMap[postId]);
            totalCommentCount += commentsMap[postId].length;
        }
        // --- MODIFICATION END ---


        // Check if *any* posts or comments were found after combining lower/upper cases
        if (postIds.length === 0 && totalCommentCount === 0) {
            // Updated message to reflect that variations were checked
            container.innerHTML = `<div class="details-message info">No posts or comments found specifically matching category <strong>${formattedCategory}</strong> (or its variations like ${lowerCategory}/${upperCategory}) on ${dateStr}.</div>`;
            return;
        }

        // --- The rest of the function uses the combined 'postIds' and 'commentsMap' ---

        // --- Pre-fetch Post Titles (using combined commentsMap) ---
        let postTitlesMap = {};
        let uniquePostIdsInComments = Object.keys(commentsMap); // Use combined map
        if (uniquePostIdsInComments.length > 0) {
             const uniquePostRefs = uniquePostIdsInComments.map(id => doc(db, postsCollection, id));
             // Catch errors for individual fetches during Promise.all
             const parentPostSnaps = await Promise.all(uniquePostRefs.map(ref =>
                 getDoc(ref).catch(e => {
                     console.error(`Failed to fetch parent post ${ref.id} for category view`, e);
                     // Return an object indicating failure for this specific ID
                     return { id: ref.id, error: true };
                 })
             ));
             parentPostSnaps.forEach(snap => {
                 // Check if fetch was successful and doc exists
                 if (snap && !snap.error && snap.exists()) {
                     postTitlesMap[snap.id] = snap.data().title || 'Untitled Post';
                 } else if (snap && !snap.error && !snap.exists()) {
                     // Document doesn't exist (might have been deleted)
                     postTitlesMap[snap.id] = 'Unknown Post (Not Found)';
                 } else if (snap && snap.error) {
                     // Fetch failed for this specific post
                     postTitlesMap[snap.id] = 'Error Loading Title';
                 } else {
                     // Handle unexpected cases, maybe log the snap object
                     console.warn("Unexpected state during parent post pre-fetch:", snap);
                 }
             });
         }
        // --- End Pre-fetch ---


        // --- Start building HTML ---
        // (Display title uses formattedCategory)
        let html = `
            <div class="category-date-details-wrapper">
                <h2 class="category-date-title">
                    Category: <span class="category-name">${formattedCategory}</span> <span class="date-info">on ${dateStr}</span>
                </h2>
        `;

        // --- Display Posts (using combined postIds) ---
        html += `<h3 class="posts-section-title">Posts (${postIds.length}):</h3>`;
        if (postIds.length === 0) {
            html += `<p class="no-posts-message">No posts found matching this category on this date.</p>`;
        } else {
            const postPromises = postIds.map(postId =>
                getDoc(doc(db, postsCollection, postId)).catch(e => {
                    console.error(`Failed to fetch post ${postId}`, e);
                    return null; // Return null on error for this specific post
                })
            );
            const postSnaps = await Promise.all(postPromises);

            postSnaps.forEach(postSnap => {
                if (postSnap && postSnap.exists()) {
                    const postData = postSnap.data();
                    const postId = postSnap.id;
                    const postTitle = postData.title || "No Title";
                    const postBody = postData.body || "";
                    const author = postData.author || 'Unknown';
                    const postUrl = postData.URL || '#';
                    let date = new Date(); // Default date
                    // Robust date handling from Firestore Timestamp or string
                    if (postData.created?.toDate) { // Check if it's a Firestore Timestamp
                        date = postData.created.toDate();
                    } else if (postData.created && typeof postData.created === 'string') {
                        try { date = new Date(postData.created); } catch (e) { /* Ignore invalid date string */ }
                    } else if (postData.created && typeof postData.created === 'number') { // Handle Unix timestamp (seconds or ms)
                         try { date = new Date(postData.created * (postData.created < 1e12 ? 1000 : 1)); } catch(e) {}
                    }

                    const formattedPostDate = isNaN(date) ? 'Invalid Date' : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

                    // Append post HTML (using classes, not inline styles)
                    html += `
                        <div class="search-result-post category-post-item">
                            <h4 class="post-title">
                                <a href="${postUrl}" target="_blank" rel="noopener noreferrer">${postTitle}</a>
                            </h4>
                            <p class="post-meta">By <strong>${author}</strong> on ${formattedPostDate}</p>
                            <p class="post-body-excerpt">
                                ${postBody ? escapeHtml(postBody.substring(0, 250) + (postBody.length > 250 ? '...' : '')) : '<i>No body content</i>'}
                            </p>
                            <div class="post-badges">${generateBadgesHtml(postData)}</div>
                            <button class="view-full-post-btn" data-post-id="${postId}">
                                View Full Post
                            </button>
                        </div>
                    `;
                } else {
                    // Message if a specific post couldn't be loaded
                    html += `<div class="details-message error-partial"><em>Post data unavailable or failed to load for one of the IDs.</em></div>`;
                }
            });
        }


        // --- Display Comments (using combined commentsMap and totalCommentCount) ---
        html += `<h3 class="comments-section-title">Comments (${totalCommentCount}):</h3>`;
        if (totalCommentCount === 0) {
            html += `<p class="no-comments-message">No comments found matching this category on this date.</p>`;
        } else {
            let commentFetchPromises = [];
            for (const postId in commentsMap) {
                commentsMap[postId].forEach(commentId => {
                    // Construct the reference to the comment subcollection document
                    const commentRef = doc(db, postsCollection, postId, 'comments', commentId);
                    commentFetchPromises.push(
                        getDoc(commentRef).catch(e => {
                            console.error(`Failed to fetch comment ${commentId} in post ${postId}`, e);
                            return null; // Return null on error for this specific comment
                        })
                    );
                });
            }
            const commentSnaps = await Promise.all(commentFetchPromises);

            commentSnaps.forEach(commentSnap => {
                if (commentSnap && commentSnap.exists()) {
                    const commentData = commentSnap.data();
                    const author = commentData.author || 'Unknown';
                    const commentBody = commentData.body || "";
                    // Get the parent post ID directly from the reference path
                    const commentPostId = commentSnap.ref.parent.parent.id;
                    // Use the pre-fetched title
                    const parentPostTitle = postTitlesMap[commentPostId] || 'Loading Title...';

                    let date = new Date(); // Default date
                     // Robust date handling
                    if (commentData.created?.toDate) {
                        date = commentData.created.toDate();
                    } else if (commentData.created && typeof commentData.created === 'string') {
                         try { date = new Date(commentData.created); } catch(e) {}
                    } else if (commentData.created && typeof commentData.created === 'number') {
                         try { date = new Date(commentData.created * (commentData.created < 1e12 ? 1000 : 1)); } catch(e) {}
                    }
                    const formattedDate = isNaN(date) ? 'Invalid Date' : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

                    const commentBadges = generateCommentBadgesHtml(commentData); // Assuming this exists

                    // Append comment HTML (using classes)
                    html += `
                        <div class="search-result-comment category-comment-item">
                            <p class="comment-meta">
                                In Post: <span class="parent-post-title">"${escapeHtml(parentPostTitle)}"</span> (Comment by <strong>${author}</strong> on ${formattedDate})
                            </p>
                            <p class="comment-body">
                                ${commentBody ? escapeHtml(commentBody) : '<i>No comment body.</i>'}
                            </p>
                            <div class="comment-badges">${commentBadges}</div>
                            <button class="view-full-post-btn" data-post-id="${commentPostId}">
                                View Post Thread
                            </button>
                        </div>
                    `;
                } else {
                    // Optional: Handle missing comment message if needed
                    // html += `<div class="details-message error-partial"><em>Comment data unavailable or failed to load for one ID.</em></div>`;
                }
            });
        }

        // --- Finalize HTML and add listeners ---
        html += `</div>`; // Close wrapper
        container.innerHTML = html;

        // Re-Add event listeners for the 'View Full Post'/'View Post Thread' buttons
        container.querySelectorAll('.view-full-post-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const postId = button.getAttribute('data-post-id');
                if (postId) {
                    // Assuming fetchAndDisplayPostDetails is defined elsewhere
                    fetchAndDisplayPostDetails(postId);
                } else {
                    console.error("Could not find data-post-id on clicked element:", button);
                    alert("Error: Could not determine which post to view.");
                }
            });
        });

    } catch (error) {
        console.error(`Error fetching details for category ${formattedCategory} on ${dateStr}:`, error);
        container.innerHTML = `<div class="details-message error">An error occurred while fetching activity details. Please check the console or try again later.</div>`;
    }
}

// Helper function to escape HTML (prevent XSS)
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

  // For clicking on the authors chart bars
  async function fetchAndDisplayPostsAndCommentsByAuthor(authorName) {
    const container = document.getElementById('post-details');
    // Use class for loading message
    container.innerHTML = `<div class="details-message loading"><i>Loading posts and comments for ${authorName}...</i></div>`;

    const subredditSelect = document.getElementById('subreddit-select');
    const selectedSubreddit = subredditSelect.value;
    const lowerSub = selectedSubreddit.toLowerCase();
    const postsCollectionName = (lowerSub === "temasekpoly") ? "posts" : `${lowerSub}_posts`;
    const authorsCollectionName = (lowerSub === "temasekpoly") ? "authors" : `${lowerSub}_authors`;

    try {
        const authorRef = doc(db, authorsCollectionName, authorName);
        const authorSnap = await getDoc(authorRef);

        if (!authorSnap.exists()) {
            // Use class for message
            container.innerHTML = `<div class="details-message info">No activity data found for author: <strong>${authorName}</strong>.</div>`;
            return;
        }

        const authorData = authorSnap.data();
        const postIds = authorData.posts || [];
        const commentsMap = authorData.comments || {}; // { postId: [commentId1, commentId2], ... }

        // Start building HTML (removed inline styles, using classes)
        let html = `
          <div class="author-details-wrapper">
            <h2 class="author-details-title">
              Activity by ${authorName}
            </h2>
        `;

        // --- Fetch and Display Posts ---
        html += `<h3 class="posts-section-title">Posts (${postIds.length}):</h3>`;
        if (postIds.length === 0) {
            html += `<p class="no-posts-message">No posts found by this author.</p>`;
        } else {
            const postPromises = postIds.map(postId => getDoc(doc(db, postsCollectionName, postId)).catch(e => { console.error("Post fetch error:", e); return null; })); // Add catch
            const postSnaps = await Promise.all(postPromises);

            postSnaps.forEach(postSnap => {
                if (postSnap && postSnap.exists()) { // Check snap exists
                    const postData = postSnap.data();
                    const postId = postSnap.id;
                    const postTitle = postData.title || "No Title";
                    const postBody = postData.body || "";
                    const postAuthor = postData.author || 'Unknown';
                    const postUrl = postData.URL || '#';
                    let postDate = new Date();
                    if (postData.created?.toDate) postDate = postData.created.toDate();
                    else if (postData.created) try { postDate = new Date(postData.created); } catch (e) {}
                    const formattedPostDate = postDate.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');

                    // Removed inline styles, added classes
                    html += `
                      <div class="search-result-post author-post-item">
                        <h4 class="post-title">
                          <a href="${postUrl}" target="_blank">${postTitle}</a>
                        </h4>
                        <p class="post-meta">Posted on ${formattedPostDate}</p>
                        <p class="post-body-excerpt">
                          ${postBody || '<i>No body content</i>'}
                        </p>
                        <div class="post-badges">${generateBadgesHtml(postData)}</div>
                        <button class="view-full-post-btn" data-post-id="${postId}">
                          View Full Post
                        </button>
                      </div>
                    `;
                } else {
                    // Use class for message
                     html += `<div class="details-message error-partial"><em>Post data unavailable.</em></div>`;
                }
            });
        }

        // --- Fetch and Display Comments ---
        let commentFetchPromises = [];
        let postTitlesMap = {};
        let parentPostIds = Object.keys(commentsMap);
        let commentCount = 0;

        // Pre-fetch needed parent post titles (No style changes needed here)
        if (parentPostIds.length > 0) {
            const uniquePostRefs = parentPostIds.map(id => doc(db, postsCollectionName, id));
             const parentPostSnaps = await Promise.all(uniquePostRefs.map(ref => getDoc(ref).catch(e => { console.error(`Failed to fetch parent post ${ref.id}`, e); return null; })));
             parentPostSnaps.forEach(snap => {
                 if (snap && snap.exists()) {
                     postTitlesMap[snap.id] = snap.data().title || 'Untitled Post';
                 } else if (snap) {
                     postTitlesMap[snap.id] = 'Unknown Post (Deleted?)';
                 }
             });
        }


        // Prepare comment fetch promises
        for (const postId in commentsMap) {
            const commentIds = commentsMap[postId];
            commentCount += commentIds.length;
            commentIds.forEach(commentId => {
                const commentRef = doc(db, `${postsCollectionName}/${postId}/comments`, commentId);
                 commentFetchPromises.push(getDoc(commentRef).catch(e => { console.error("Comment fetch error:", e); return null; })); // Add catch
            });
        }

        // Comments Section Heading
        html += `<h3 class="comments-section-title">Comments (${commentCount}):</h3>`;

        if (commentFetchPromises.length === 0) {
            html += `<p class="no-comments-message">No comments found by this author.</p>`;
        } else {
            const commentSnaps = await Promise.all(commentFetchPromises);

            commentSnaps.forEach(commentSnap => {
                if (commentSnap && commentSnap.exists()) { // Check snap exists
                    const commentData = commentSnap.data();
                    const commentBody = commentData.body || "";
                    const commentAuthor = commentData.author || 'Unknown';
                    const commentPostId = commentSnap.ref.parent.parent.id;
                    const parentPostTitle = postTitlesMap[commentPostId] || 'Unknown Post';

                    let commentDate = new Date();
                    if (commentData.created?.toDate) commentDate = commentData.created.toDate();
                    else if (commentData.created) try { commentDate = new Date(commentData.created); } catch (e) {}
                    const formattedCommentDate = commentDate.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');

                    const commentBadges = generateCommentBadgesHtml(commentData);

                    // Removed inline styles, added classes
                    html += `
                      <div class="search-result-comment author-comment-item">
                          <p class="comment-meta">
                              In Post: <span class="parent-post-title">"${parentPostTitle}"</span> (On ${formattedCommentDate})
                          </p>
                          <p class="comment-body">
                              ${commentBody || '<i>No comment body.</i>'}
                          </p>
                          <div class="comment-badges">${commentBadges}</div>
                          <button class="view-full-post-btn view-thread-btn" data-post-id="${commentPostId}"> {/* Added view-thread-btn class */}
                              View Post Thread
                          </button>
                      </div>
                    `;
                } else {
                    // Optional: Handle missing comment
                }
            });
        }

        html += `</div>`; // Close wrapper
        container.innerHTML = html;

        // Re-Add event listeners
        container.querySelectorAll('.view-full-post-btn').forEach(button => {
            button.addEventListener('click', (event) => {
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
         // Use class for error message
        container.innerHTML = `<div class="details-message error">Error fetching details for <strong>${authorName}</strong>. Please check the console.</div>`;
    }
}


  // ---------------------------------------------
  // NEW: KEYWORD SEARCH FUNCTIONALITY
  // ---------------------------------------------

  // Function to highlight keyword in text (remains the same)
  function highlightKeyword(text, keyword) {
    if (!text || !keyword) return text;
    try {
      const regex = new RegExp(`(${keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
      return text.replace(regex, '<mark>$1</mark>');
    }
    catch (e) {
      console.error("Regex error during highlighting:", e);
      // Basic fallback
      return text.replace(new RegExp(keyword, 'gi'), `<mark>${keyword}</mark>`);
    }
  }

  // Function to perform search across posts and comments
  async function searchByKeyword() {
    const keyword = keywordInput.value.trim();
    if (!keyword) {
      postDetailsContainer.innerHTML = '<p class="details-message info">Please enter a keyword to search.</p>'; // Add class
      return;
    }

    postDetailsContainer.innerHTML = `<p class="details-message loading">Searching for "${keyword}"...</p>`; // Add class

    const subredditSelect = document.getElementById('subreddit-select');
    const selectedSubreddit = subredditSelect.value;
    const lowerSub = selectedSubreddit.toLowerCase();
    const postsCollectionName = (lowerSub === "temasekpoly") ? "posts" : `${lowerSub}_posts`;
    const lowerKeyword = keyword.toLowerCase();

    let matchingPosts = [];
    let matchingComments = []; // Will store { commentData, commentId, postId, postTitle }

    try {
        // Fetch posts within date range (as before)
        const startDateValue = document.getElementById('start-date').value;
        const endDateValue = document.getElementById('end-date').value;
        const startDate = new Date(startDateValue);
        const endDate = new Date(endDateValue);
        endDate.setHours(23, 59, 59, 999);

        let postsQuery = query(collection(db, postsCollectionName),
            orderBy('created', 'desc'),
            where('created', '>=', startDate),
            where('created', '<=', endDate)
        );

        const postsSnapshot = await getDocs(postsQuery);
        // console.log(`Keyword search: Found ${postsSnapshot.size} posts in date range.`);

        const commentFetchPromises = [];
        const postDataMap = new Map(); // Store post data temporarily

        postsSnapshot.forEach(postDoc => {
            const postData = postDoc.data();
            const postId = postDoc.id;
            postDataMap.set(postId, { postId, ...postData }); // Store full post data with ID

            const postTitle = postData.title || "No Title";
            const postBody = postData.body || "";

            // Check if post title or body matches
            if (postTitle.toLowerCase().includes(lowerKeyword) || postBody.toLowerCase().includes(lowerKeyword)) {
                matchingPosts.push({ postId, ...postData }); // Add matched post
            }

            // Queue comment fetches
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
                    return commentsForThisPost;
                }).catch(error => {
                    console.error(`Error fetching comments for post ${postId}:`, error);
                    return [];
                })
            );
        });

        // Wait for all comment fetches
        const commentsResults = await Promise.all(commentFetchPromises);

        // Flatten results and add comments to matchingComments
        commentsResults.forEach(postComments => {
            matchingComments.push(...postComments);
        });

        displaySearchResults(keyword, matchingPosts, matchingComments); // Pass the collected data
    }
    catch (error) {
        console.error("Error during keyword search:", error);
        postDetailsContainer.innerHTML = `<p class="details-message error">An error occurred during the search. Please check the console.</p>`; // Add class
    }
  }


  // Function to display search results (using classes)
  function displaySearchResults(keyword, posts, comments) {
    const postDetailsContainer = document.getElementById('post-details');

    if (posts.length === 0 && comments.length === 0) {
        // Use classes for styling
        postDetailsContainer.innerHTML = `
          <div class="search-results-wrapper no-results">
            <h2 class="search-results-title">Search Results</h2>
            <p class="search-no-results-message">No posts or comments found matching "<strong>${keyword}</strong>".</p>
          </div>`;
        return;
    }

    // Use classes for styling
    let html = `
      <div class="search-results-wrapper">
        <h2 class="search-results-title">
          Search Results for "${keyword}"
        </h2>
    `;

    // --- Display matching posts ---
    if (posts.length > 0) {
        html += `<h3 class="posts-section-title">Matching Posts (${posts.length}):</h3>`;
        posts.forEach(postData => {
            const postId = postData.postId; // postId should be available here
            const postTitle = postData.title || "No Title";
            const postBody = postData.body || "";
            const author = postData.author || 'Unknown';
            let date = new Date();
            if (postData.created?.toDate) date = postData.created.toDate();
            else if (postData.created) try { date = new Date(postData.created); } catch(e) {}
            const formattedDate = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const url = postData.URL || '#';

            // Removed inline styles, added classes
            html += `
              <div class="search-result-post search-item-card">
                <h4 class="post-title">
                  <a href="${url}" target="_blank">${highlightKeyword(postTitle, keyword)}</a>
                </h4>
                <p class="post-meta">By <strong>${author}</strong> on ${formattedDate}</p>
                <p class="post-body-excerpt">
                  ${highlightKeyword(postBody, keyword) || '<i>No body content</i>'}
                </p>
                <div class="post-badges">${generateBadgesHtml(postData)}</div>
                <button class="view-full-post-btn" data-post-id="${postId}">
                  View Full Post
                </button>
              </div>
            `;
        });
    }

    // --- Display matching comments ---
    if (comments.length > 0) {
        // Add separator class if needed (handled by CSS)
        const separatorClass = posts.length > 0 ? 'with-separator' : '';
        html += `<h3 class="comments-section-title ${separatorClass}">Matching Comments (${comments.length}):</h3>`;

        comments.forEach(commentInfo => {
            const commentData = commentInfo.commentData;
            const commentBody = commentData.body || "";
            const author = commentData.author || 'Unknown';
            let date = new Date();
            if (commentData.created?.toDate) date = commentData.created.toDate();
            else if (commentData.created) try { date = new Date(commentData.created); } catch(e) {}
            const formattedDate = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const commentPostId = commentInfo.postId;
            const parentPostTitle = commentInfo.postTitle || 'Untitled Post';

            const commentBadges = generateCommentBadgesHtml(commentData);

            // Removed inline styles, added classes
            html += `
              <div class="search-result-comment search-item-card">
                  <p class="comment-meta">
                      Comment by <strong>${author}</strong> on ${formattedDate}
                      (in post: <span class="parent-post-title">"${parentPostTitle}"</span>)
                  </p>
                  <p class="comment-body">
                      ${highlightKeyword(commentBody, keyword) || '<i>No comment body.</i>'}
                  </p>
                  <div class="comment-badges">${commentBadges}</div>
                  <button class="view-full-post-btn view-thread-btn" data-post-id="${commentPostId}">
                      View Post Thread
                  </button>
              </div>
            `;
        });
    }

    html += `</div>`; // Close wrapper
    postDetailsContainer.innerHTML = html;

    // Re-Add event listeners
    postDetailsContainer.querySelectorAll('.view-full-post-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const postId = button.getAttribute('data-post-id');
            if (postId) {
                fetchAndDisplayPostDetails(postId);
            } else {
                console.error("Missing data-post-id attribute on button:", button);
            }
        });
    });
  }

  // Remove the `displaySearchResults_old_styling` function as it seems unused/deprecated.

  // Helper function to generate badges HTML (removed inline style from wrapper)
  function generateBadgesHtml(postData) {
    const category = postData.category || 'N/A';
    const emotion = postData.emotion || 'N/A';
    const engagementScore = postData.engagementScore ?? 0;
    const score = postData.score ?? 0;
    const totalNegativeSentiments = postData.totalNegativeSentiments || 0;
    const totalPositiveSentiments = postData.totalPositiveSentiments || 0;
    const weightedSentimentScore = postData.weightedSentimentScore ?? 0;
    const safeNumberStr = engagementScore.toFixed(2);

    const scoreStr = score.toString();
    const negSentStr = totalNegativeSentiments.toString();
    const weightSentStr = weightedSentimentScore.toFixed(2).toString();

    // Add class to the container div
    return `
      <div class="shields-container post-badges-container">
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

  // Helper function formatBadgeValue (remains the same)
  function formatBadgeValue(valueStr, width = 4) {
    let formatted = String(valueStr); // Ensure it's a string

    if (formatted.length > width) {
        formatted = formatted.substring(0, width);
    }
    // Use non-breaking space for padding in URLs if needed, or adjust as required by shields.io
    formatted = formatted.padStart(width, '\u00A0'); // Using non-breaking space

    return formatted;
  }


  // Helper function generateCommentBadgesHtml (removed inline style from wrapper)
  function generateCommentBadgesHtml(commentData) {
    const sentiment = commentData.sentiment ?? 0;
    let sentimentColor = 'yellow';
    if (sentiment < 0) sentimentColor = 'red';
    else if (sentiment > 0) sentimentColor = 'green';
    const score = commentData.score ?? 0;
    const emotion = commentData.emotion || 'N/A';

    const scoreStr = score.toString();
    const sentimentStr = sentiment.toFixed(2).toString(); // Ensure consistent precision before formatting

    const formattedScore = formatBadgeValue(scoreStr, 4);
    const formattedSentiment = formatBadgeValue(sentimentStr, 4);

    const urlEncodedScore = encodeURIComponent(formattedScore.replace(/-/g, '--'));
    const urlEncodedSentiment = encodeURIComponent(formattedSentiment.replace(/-/g, '--'));
    const urlEncodedEmotion = encodeURIComponent(emotion.replace(/-/g, '--')); // Also replace hyphens in emotion

    // Add class to the container div
    return `
      <div class="shields-container comment-badges-container">
        <img src="https://img.shields.io/badge/reddit_score-${urlEncodedScore}-brightgreen?style=flat-square" alt="Reddit Score">
        <img src="https://img.shields.io/badge/sentiment-${urlEncodedSentiment}-${sentimentColor}?style=flat-square" alt="Sentiment">
        <img src="https://img.shields.io/badge/emotion-${urlEncodedEmotion}-purple?style=flat-square" alt="Emotion">
      </div>
    `;
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
        let avg = sum / allPostsData.length;

        // STRICTOR FIX: If the rounded value is 0, force it to be positive 0
        let formattedAvg = avg.toFixed(2);
        if (formattedAvg === "-0.00" || formattedAvg === "-0.0") {
            formattedAvg = "0.00";
        }
      
      document.getElementById("avgWeightedScoreNumber").textContent = formattedAvg;

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

      // Time Series & Authors
      updateTimeSeriesChart();
      updateAuthorsChart(); // Make sure this fetches data for the current subreddit

      // Default post list
      postListDropdown.value = 'lowestRaw'; // Or keep current selection if desired
      renderPostList(allPostsData, postListDropdown.value); // Update list with new data
    }
    catch (error) {
      console.error("Error building charts:", error);
       // Maybe display an error message to the user in a dedicated area
       postDetailsContainer.innerHTML = `<p class="details-message error">Error loading dashboard data. Please check filters and try again.</p>`;
    }
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

  // Set default active tab on load - Handled by CSS and initial HTML structure now
  // Ensure the initially active tab button has the 'active' class in HTML
  // And the corresponding tab content also has the 'active' class in HTML

  // Reset Zoom Buttons (Listeners remain the same)
  document.getElementById('resetZoomWeightedBtn').addEventListener('click', () => {
    if (weightedSentimentChart) weightedSentimentChart.resetZoom();
  });
  document.getElementById('resetZoomStackedBtn').addEventListener('click', () => {
    if (commentsSentimentChart) commentsSentimentChart.resetZoom();
  });
  document.getElementById('resetZoomTotalCommentsBtn').addEventListener('click', () => {
    if (totalCommentsChart) totalCommentsChart.resetZoom();
  });
  document.getElementById('resetZoomEngagementBtn').addEventListener('click', () => {
    if (engagementScoreChart) engagementScoreChart.resetZoom();
  });
  document.getElementById('resetZoomTimeSeriesBtn').addEventListener('click', () => {
    if (timeSeriesChart) timeSeriesChart.resetZoom();
  });

  // --- Filter Visibility Logic ---
  const subredditSelect = document.getElementById("subreddit-select");
  // const iitFilterContainer = document.getElementById("iit-filter-container"); // Assuming label and input are wrapped
  // const tpRelatedFilterContainer = document.getElementById("tp-related-filter-container"); // Assuming label and input are wrapped
  const iitFilter = document.getElementById("iit-filter");
  const tpRelatedFilter = document.getElementById("tp-related-filter");
  // Get the labels associated with the checkboxes

  const iitLabel = document.querySelector('label[for="iit-filter"]');
  const tpLabel = document.querySelector('label[for="tp-related-filter"]');

  function updateFilterVisibility() {
    // When "TemasekPoly" is selected, show IIT filter and hide TP-Related filter
    if (subredditSelect.value === "TemasekPoly") {
      if (iitFilter) { iitFilter.style.display = "inline-block"; }
      if (iitLabel) { iitLabel.style.display = "inline-block"; }
      if (tpRelatedFilter) { tpRelatedFilter.style.display = "none"; }
      if (tpLabel) { tpLabel.style.display = "none"; }
    } 
    else if (subredditSelect.value === "sgExams") {
      // If sgExams then hide IIT filter and show TP-Related filter
      if (iitFilter) { iitFilter.style.display = "none"; }
      if (iitLabel) { iitLabel.style.display = "none"; }
      if (tpRelatedFilter) { tpRelatedFilter.style.display = "inline-block"; }
      if (tpLabel) { tpLabel.style.display = "inline-block"; }
    }
    else{
      if (iitFilter) { iitFilter.style.display = "none"; }
      if (iitLabel) { iitLabel.style.display = "none"; }
      if (tpRelatedFilter) { tpRelatedFilter.style.display = "none"; }
      if (tpLabel) { tpLabel.style.display = "none"; }
      //const filterBtn = document.getElementById('filter-btn');
      //if (filterBtn) { filterBtn.style.display = "none"; }
    }
  }

  // Initial call to set visibility based on default selection
  updateFilterVisibility();

  // Update filters and charts when the subreddit selection changes
  subredditSelect.addEventListener("change", () => {
    updateFilterVisibility(); // Update visibility first
    updateCharts(); // Then update charts based on new selection and filters
  });

}); // End DOMContentLoaded
// --- Import only what you need from Firebase SDKs (Modular v9) ---
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-analytics.js';
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs
} from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-firestore.js';

console.log("Script is loaded and running.");

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

      // Raw sentiment (assumes a field 'rawSentimentScore' in each doc)
      const rawSentiment = postData.rawSentimentScore || 0;
      const category = postData.category || "";

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
        created: createdDate,  // store as JS Date if possible
        postDetails: postData
      });
    });

    return dataArray;
  }

  // ----------------------------
  // CHART 1: WEIGHTED SENTIMENT
  // ----------------------------
  function renderWeightedSentimentChart(data) {
    console.log("Rendering Weighted Sentiment Chart with data:", data);

    const labels = data.map(item => item.title);
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
        scales: {
          y: { beginAtZero: true }
        },
        onClick: (evt, elements) => {
          if (elements.length > 0) {
            const barIndex = elements[0].index;
            const item = data[barIndex];
            alert(
              `Post Title: ${item.title}\n` +
              `Category: ${item.category}\n` +
              `Emotion: ${item.emotion}\n` +
              `Engagement Score: ${item.engagementScore}\n` +
              `IIT Related: ${item.iit}\n` +
              `Raw Sentiment Score: ${item.rawSentimentScore}\n` +
              `Summary: ${item.summary}\n` +
              `Weighted Score: ${item.weightedSentimentScore}\n` +
              `Created: ${item.created}`
            );
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

    const labels = data.map(item => item.title);
    const engagementScores = data.map(item => item.engagementScore);

    // For example, color all engagement bars purple
    const backgroundColors = engagementScores.map(() => 'rgba(153, 102, 255, 0.8)');

    // Destroy existing chart if it exists
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
        scales: {
          y: { beginAtZero: true }
        },
        onClick: (evt, elements) => {
          if (elements.length > 0) {
            const barIndex = elements[0].index;
            const item = data[barIndex];
            alert(
              `Post Title: ${item.title}\n` +
              `Engagement Score: ${item.engagementScore}\n` +
              `Created: ${item.created}`
            );
          }
        }
      }
    });
  }

  // ----------------------------
  // POST LIST DROPDOWN / TABLE
  // ----------------------------

  // Re-render the table whenever the dropdown changes
  const postListDropdown = document.getElementById('postListDropdown');
  postListDropdown.addEventListener('change', () => {
    renderPostList(allPostsData, postListDropdown.value);
  });

  // This function sorts/filters the data to get 10 items, then displays them in a table
  function renderPostList(data, listType) {
    console.log("Rendering post list:", listType);

    // Sort/filter logic
    let selectedPosts = [...data]; // shallow copy so we don't mutate original

    switch (listType) {
      case 'topEngaged':
        // Sort descending by engagementScore, then take top 10
        selectedPosts.sort((a, b) => b.engagementScore - a.engagementScore);
        selectedPosts = selectedPosts.slice(0, 10);
        break;

      case 'lowestWs':
        // Sort ascending by weightedSentimentScore, take first 10
        selectedPosts.sort((a, b) => a.weightedSentimentScore - b.weightedSentimentScore);
        selectedPosts = selectedPosts.slice(0, 10);
        break;

      case 'lowestRaw':
        // Sort ascending by rawSentimentScore, take first 10
        selectedPosts.sort((a, b) => a.rawSentimentScore - b.rawSentimentScore);
        selectedPosts = selectedPosts.slice(0, 10);
        break;

      case 'highestWs':
        // Sort descending by weightedSentimentScore, take top 10
        selectedPosts.sort((a, b) => b.weightedSentimentScore - a.weightedSentimentScore);
        selectedPosts = selectedPosts.slice(0, 10);
        break;

      case 'highestRaw':
        // Sort descending by rawSentimentScore, take top 10
        selectedPosts.sort((a, b) => b.rawSentimentScore - a.rawSentimentScore);
        selectedPosts = selectedPosts.slice(0, 10);
        break;

      case 'recentPosts':
        // Sort descending by created date (most recent first), top 10
        selectedPosts.sort((a, b) => new Date(b.created) - new Date(a.created));
        selectedPosts = selectedPosts.slice(0, 10);
        break;
      
      default:
        // Just in case
        selectedPosts = [];
        break;
    }

    // Build table HTML
    const tableHtml = buildPostsTable(selectedPosts);

    // Insert table into the page
    const container = document.getElementById('postListContainer');
    container.innerHTML = tableHtml;
  }

  // Helper function: build an HTML table from a list of posts
  function buildPostsTable(posts) {
    let html = `
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Weighted Score</th>
            <th>Engagement Score</th>
            <th>Raw Sentiment</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const p of posts) {
      html += `
        <tr>
          <td>${p.title}</td>
          <td>${p.weightedSentimentScore.toFixed(2)}</td>
          <td>${p.engagementScore.toFixed(2)}</td>
          <td>${p.rawSentimentScore.toFixed(2)}</td>
          <td>${p.created}</td>
        </tr>
      `;
    }
    html += `</tbody></table>`;
    return html;
  }

  // Calculate positive, neutral, negative sentiment percentages and render pie chart
  function renderSentimentPieChart(data) {
    const totalPosts = data.length;
  
    const positiveCount = data.filter(p => p.weightedSentimentScore > 0).length;
    const neutralCount = data.filter(p => p.weightedSentimentScore === 0).length;
    const negativeCount = data.filter(p => p.weightedSentimentScore < 0).length;
  
    const positivePercent = ((positiveCount / totalPosts) * 100).toFixed(1);
    const neutralPercent = ((neutralCount / totalPosts) * 100).toFixed(1);
    const negativePercent = ((negativeCount / totalPosts) * 100).toFixed(1);
  
    const ctx = document.getElementById('sentimentPieChart').getContext('2d');
  
    // Destroy existing chart instance if it exists
    if (window.sentimentPieChartInstance) {
      window.sentimentPieChartInstance.destroy();
    }
  
    window.sentimentPieChartInstance = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Pos', 'Neu', 'Neg'],
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
            position: 'left' // Legends positioned to the right
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.label}: ${context.raw}%`
            }
          }
        }
      }
    });
    // Explicitly set canvas size via JS (you can adjust these as needed)
    ctx.canvas.width = 100; // desired width in pixels
    ctx.canvas.height = 100; // desired height in pixels
  }
  


  // ----------------------------
  // MAIN: FETCH DATA, RENDER CHARTS & DEFAULT LIST
  // ----------------------------
  async function updateCharts() {
    try {
      allPostsData = await fetchPostsInRange(); // store globally
      console.log("Data fetched from Firestore:", allPostsData);

      // Update the Post Count box with the number of posts
      document.querySelector("#postCount .postCount-number").textContent = allPostsData.length;

      // Calculate and display average weighted sentiment score:
      if (allPostsData.length > 0) {
        const sum = allPostsData.reduce((acc, post) => acc + post.weightedSentimentScore, 0);
        const avg = sum / allPostsData.length;

        // Update new box
        document.getElementById("avgWeightedScoreNumber").textContent = avg.toFixed(2);
      } 
      else {
        document.getElementById("avgWeightedScoreNumber").textContent = "N/A";
      }

      renderSentimentPieChart(allPostsData);

      // Render Weighted Sentiment chart
      renderWeightedSentimentChart(allPostsData);

      // Render Engagement Score chart
      renderEngagementScoreChart(allPostsData);

      // By default, show "Lowest 10 Weighted Sentiment Posts"
      postListDropdown.value = 'lowestWs';
      renderPostList(allPostsData, 'lowestWs');
    } 
    catch (error) {
      console.error("Error building charts:", error);
    }
  }

  // 10. Filter button event
  document.getElementById('filter-btn').addEventListener('click', updateCharts);

  // 11. Initial load
  updateCharts();
});
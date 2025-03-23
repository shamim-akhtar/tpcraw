// script.js
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

// 1. Set default end date to today as soon as the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
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
  getAnalytics(app);

  // 4. Get Firestore reference
  const db = getFirestore(app);

  // 5. Filter function
  async function fetchAndRenderPosts() {
    // Get start/end dates
    const startDateValue = document.getElementById('start-date').value;
    const endDateValue = document.getElementById('end-date').value;

    const startDate = new Date(startDateValue);
    const endDate = new Date(endDateValue);
    endDate.setHours(23, 59, 59, 999); // include the entire end date

    // Build base query: from collection('posts'), order by 'created' descending
    let q = query(
      collection(db, 'posts'),
      orderBy('created', 'desc')
    );

    // If user specified a start date
    if (startDateValue) {
      // Firestore requires Timestamps or Date objects to compare
      q = query(q, where('created', '>=', startDate));
    }

    // If user specified an end date
    if (endDateValue) {
      q = query(q, where('created', '<=', endDate));
    }

    // Execute the query
    const snapshot = await getDocs(q);
    const posts = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      posts.push(data);
    });

    renderPosts(posts);
  }

  // 6. Render posts to the DOM
  function renderPosts(posts) {
    document.getElementById('posts-count').textContent = `Total Posts: ${posts.length}`;
    const postsList = document.getElementById('posts-list');
    postsList.innerHTML = '';

    posts.forEach((post) => {
      // Create a "card"
      const card = document.createElement('div');
      card.classList.add('card');

      // Title
      const h3 = document.createElement('h3');
      h3.textContent = post.title || 'No Title';
      card.appendChild(h3);

      // Created date
      let formattedDate = 'N/A';
      if (post.created?.seconds) {
        // If stored as a Firestore timestamp
        const createdMs = post.created.seconds * 1000;
        formattedDate = new Date(createdMs).toLocaleString();
      } else if (post.created) {
        // If stored as a JS date
        formattedDate = new Date(post.created).toLocaleString();
      }

      // Info
      const info = document.createElement('div');
      info.innerHTML = `
        <p>Created: ${formattedDate}</p>
        <p>Weighted Sentiment: ${post.weightedSentimentScore ?? 'N/A'}</p>
        <p>Raw Sentiment: ${post.rawSentimentScore ?? 'N/A'}</p>
        <p>Emotion: ${post.emotion ?? 'N/A'}</p>
        <p>Category: ${post.category ?? 'N/A'}</p>
        <p>IIT: ${post.iit ?? 'N/A'}</p>
        <p>Engagement Score: ${post.engagementScore ?? 'N/A'}</p>
        <p>Summary: ${post.summary ?? 'N/A'}</p>
        <p>
          Positive: ${post.commentSentimentCounts?.positive ?? 0},
          Negative: ${post.commentSentimentCounts?.negative ?? 0}
        </p>
      `;
      card.appendChild(info);

      postsList.appendChild(card);
    });
  }

  // 7. Hook up the "Filter" button
  document.getElementById('filter-btn').addEventListener('click', fetchAndRenderPosts);

  // 8. Fetch posts on page load
  fetchAndRenderPosts();
});

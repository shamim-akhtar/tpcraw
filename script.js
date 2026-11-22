// --- Import only what you need from Firebase SDKs (Modular v9) ---
import { exportModalToPDF } from './export.js';
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

// --- Responsive chart helpers -------------------------------------------
// Charts are sized by their .chart-canvas-wrap parent (see responsive.css)
// because maintainAspectRatio is false. What still has to adapt in JS is the
// content of the chart: label length, tick density, font sizes and which
// zoom gestures make sense for the input device.

const MOBILE_BREAKPOINT = 768;          // keep in sync with responsive.css
const MAX_LABEL_LENGTH_MOBILE = 14;

const isMobileViewport = () => window.innerWidth <= MOBILE_BREAKPOINT;

// Touch screens have no modifier keys and no meaningful drag-to-zoom.
const isTouchDevice = () =>
  window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

function truncateChartLabel(title) {
  const limit = isMobileViewport() ? MAX_LABEL_LENGTH_MOBILE : MAX_LABEL_LENGTH;
  if (title.length > limit) {
    return title.slice(0, limit) + '…';
  }
  // Desktop pads short titles so the rotated labels line up; on a phone that
  // padding just wastes horizontal space.
  return isMobileViewport() ? title : title.padStart(limit, ' ');
}

// Category (post-title / author) axis. autoSkip keeps the axis readable when
// dozens of bars are squeezed into a phone-width canvas.
function responsiveCategoryTicks(extra = {}) {
  const mobile = isMobileViewport();
  return {
    autoSkip: true,
    maxTicksLimit: mobile ? 8 : 30,
    maxRotation: mobile ? 90 : 60,
    minRotation: mobile ? 90 : 60,
    align: 'center',
    font: { size: mobile ? 9 : 12 },
    ...extra
  };
}

function responsiveChartTitle(text) {
  const mobile = isMobileViewport();
  return {
    display: true,
    text: text,
    align: 'start',
    font: { size: mobile ? 13 : 18, weight: '600', family: 'Arial, sans-serif' },
    color: '#333',
    padding: { top: mobile ? 4 : 10, bottom: mobile ? 10 : 20 }
  };
}

// On touch: single-finger horizontal drag pans (mode 'x' lets vertical swipes
// fall through to page scrolling) and pinch zooms. Drag-to-zoom stays a
// mouse-only gesture, otherwise it fights the pan gesture on a phone.
function responsiveZoomOptions() {
  const touch = isTouchDevice();
  return {
    pan: { enabled: true, mode: 'x', modifierKey: touch ? null : 'ctrl' },
    zoom: {
      drag: { enabled: !touch },
      pinch: { enabled: true },
      mode: 'x'
    }
  };
}

function responsiveLegend(extra = {}) {
  const mobile = isMobileViewport();
  return {
    position: mobile ? 'bottom' : 'top',
    labels: {
      boxWidth: mobile ? 10 : 40,
      padding: mobile ? 8 : 10,
      font: { size: mobile ? 10 : 12 }
    },
    ...extra
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  // --- 1. MODAL ELEMENTS ---
  const drawer = document.getElementById('post-details-container');
  const overlay = document.getElementById('drawer-overlay');
  const postDetailsContent = document.getElementById('post-details');

  function openDrawer() {
      drawer.classList.add('open');
      overlay.classList.add('active');
  }

  function closeDrawer() {
      drawer.classList.remove('open');
      overlay.classList.remove('active');
  }

  overlay.addEventListener('click', closeDrawer);

  // --- 2. CENTRAL MODAL CLICK HANDLER (Event Delegation) ---
  postDetailsContent.addEventListener('click', (e) => {
      // Trigger PDF export from export.js
      if (e.target.id === 'downloadPDFBtn') {
          exportModalToPDF();
      }
      // Handle Close
      if (e.target.classList.contains('close-drawer-btn') || e.target.id === 'closeModalX') {
          closeDrawer();
      }
      // Handle View Full Post (if clicking from a list like Search)
      if (e.target.classList.contains('view-full-post-btn')) {
          const postId = e.target.getAttribute('data-post-id');
          if (postId) fetchAndDisplayPostDetails(postId);
      }
  });

  // --- 1. PERIOD: quick buttons (7 days, 30 days, 6 months) or custom dates ---
  const startDateInput = document.getElementById('start-date');
  const endDateInput = document.getElementById('end-date');
  const periodButtons = document.getElementById('period-buttons');
  const customDates = document.getElementById('custom-dates');
  // The page always opens on the last 30 days.
  let periodDays = 30;
  try { localStorage.removeItem('periodDays'); } catch (e) { /* ignore */ }

  const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function setPeriod(days) {
    periodDays = days;
    periodButtons.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.days === String(days)));
    customDates.hidden = days !== 'custom';
    if (days !== 'custom') {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - (days - 1));
      endDateInput.value = isoDate(end);
      startDateInput.value = isoDate(start);
    } else if (!startDateInput.value || !endDateInput.value) {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 29);
      endDateInput.value = isoDate(end);
      startDateInput.value = isoDate(start);
    }
  }
  setPeriod(periodDays);

  function periodText() {
    if (periodDays !== 'custom') return periodDays === 182 ? 'Last 6 months' : `Last ${periodDays} days`;
    const fmt = v => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${fmt(startDateInput.value)} to ${fmt(endDateInput.value)}`;
  }

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
  const tabs = document.querySelectorAll('.ui-tabs .tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  const tabContainer = document.querySelector('.tab-container'); // Parent for event delegation

  // Function to switch tabs
  function switchTab(event) {
      // Check if the clicked element is a tab button (or the badge inside one)
      const button = event.target.closest('.tab-button');
      if (!button) return;
      showTab(button.dataset.tab);
  }

  function showTab(targetTab) {
      const button = document.querySelector(`.ui-tabs .tab-button[data-tab="${targetTab}"]`);
      if (!button) return;

      // Update button styles
      tabs.forEach(button => {
          button.classList.remove('active');
          // CSS will handle the active state styles (.tab-button.active)
      });
      button.classList.add('active');

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
          else if (targetTab === 'trendsTab') {
            resizeActiveTrendChart();
          }
          else if (targetTab === 'digestTab') {
            loadDigest();
          }
          else if (targetTab === 'alertsTab') {
            loadAlerts();
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

  //--------------------RESPONSIVE RE-RENDER
  // The CSS handles the box the chart lives in, but label length, tick density
  // and legend placement are baked in at render time. Re-render when the
  // viewport crosses the mobile breakpoint (rotating a phone, resizing a
  // window) so those stay correct without a page reload.
  let wasMobileViewport = isMobileViewport();
  let viewportResizeTimer = null;

  function rerenderChartsForViewport() {
    if (!Array.isArray(allPostsData) || allPostsData.length === 0) return;
    try {
      // These render from data already in memory — no extra Firestore reads.
      renderWeightedSentimentChart(allPostsData);
      renderSentimentStackChart(allPostsData);
      renderEngagementScoreChart(allPostsData);
      renderCommentsCountChart(allPostsData);

      // Authors + time series would need a refetch to re-render, so just patch
      // the size-dependent options in place.
      const sizedCharts = [window.authorsChartInstance, timeSeriesChart];
      sizedCharts.forEach(chart => {
        if (!chart) return;
        Object.assign(chart.options.plugins.title, responsiveChartTitle(chart.options.plugins.title.text));
        if (chart.options.plugins.legend) {
          chart.options.plugins.legend.position = isMobileViewport() ? 'bottom' : 'top';
          chart.options.plugins.legend.labels.boxWidth = isMobileViewport() ? 10 : 40;
        }
        chart.update('none');
      });

      // The active tab is the only one with a measurable box; nudge it.
      const activeChartSection = document.querySelector('.chart-section.active');
      if (activeChartSection) {
        const visible = activeChartSection.querySelector('.trend-view.active canvas') || activeChartSection.querySelector('canvas');
        const instance = visible && Chart.getChart(visible);
        if (instance) instance.resize();
      }
    } catch (err) {
      console.error("Error re-rendering charts for viewport change:", err);
    }
  }

  window.addEventListener('resize', () => {
    clearTimeout(viewportResizeTimer);
    viewportResizeTimer = setTimeout(() => {
      const nowMobile = isMobileViewport();
      if (nowMobile === wasMobileViewport) return; // only on a real breakpoint change
      wasMobileViewport = nowMobile;
      rerenderChartsForViewport();
    }, 200);
  });

  // Zoom gestures differ by input device (see responsiveZoomOptions), so the
  // on-screen hint has to describe what this device can actually do.
  document.querySelectorAll('.zoom-instructions').forEach(el => {
    el.textContent = isTouchDevice()
      ? 'Pinch to zoom, drag sideways to pan, and tap a bar for details.'
      : 'To zoom, click and drag on the chart. Hold Ctrl and drag to pan.';
  });

  // --------------------------------------------------------------
  // FETCH FIRESTORE POSTS - with filters for subreddit & checkboxes
  // --------------------------------------------------------------
  // range: optional {start, end} as YYYY-MM-DD, used to load the previous period
  // for comparison. Only the main load updates the school line.
  async function fetchPostsInRange(range = null) {
    const startDateValue = range ? range.start : document.getElementById('start-date').value;
    const endDateValue = range ? range.end : document.getElementById('end-date').value;

    // Filters
    const selectedSchool = document.getElementById('school-filter').value;

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

    const startDate = new Date(`${startDateValue}T00:00:00`);
    const endDate = new Date(`${endDateValue}T00:00:00`);
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

    // For sgExams, use the "relatedToTemasekPoly" filter if checked.
    // The school filter is applied after loading (see schoolTagFor), so
    // no extra Firestore index is needed.
    if (lowerSub === "sgexams") {
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
    const coverage = { total: 0, linked: 0, general: 0, unchecked: 0, shown: 0 };
    const useSchools = schoolFilterApplies(lowerSub);
    snapshot.forEach(postDoc => {
      const postData = postDoc.data();
      if (useSchools) {
        const status = schoolStatus(postData);
        coverage.total++;
        coverage[status]++;
        if (selectedSchool) {
          const tag = schoolTagFor(postData, selectedSchool);
          if (tag) {
            coverage.shown++;
          } else {
            return;
          }
        }
      }
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
        postDetails: postData // Keep full data for details view
      });
    });

    if (!range) renderSchoolCoverage(useSchools, selectedSchool, coverage);
    return dataArray;
  }

  // ---------------------------------------------
  // Chart 1: SENTIMENT DISTRIBUTION PIE CHART
  // ---------------------------------------------
  function renderSentimentSplit(data) {
    const total = data.length;
    const html = (() => {
      if (!total) return '<p class="ui-muted">No posts in this period.</p>';
      const pos = data.filter(p => p.weightedSentimentScore > 0).length;
      const neg = data.filter(p => p.weightedSentimentScore < 0).length;
      const neu = total - pos - neg;
      const pct = n => Math.round((n / total) * 100);
      const seg = (n, cls) => n ? `<i class="${cls}" style="width:${(n / total) * 100}%"></i>` : '';
      return `<div class="ui-split" role="img" aria-label="Positive ${pct(pos)}%, neutral ${pct(neu)}%, negative ${pct(neg)}%">` +
        seg(pos, 'ui-pos') + seg(neu, 'ui-neu') + seg(neg, 'ui-neg') + `</div>` +
        `<div class="ui-legend"><span class="ui-pos">Positive ${pct(pos)}%</span><span class="ui-neu">Neutral ${pct(neu)}%</span><span class="ui-neg">Negative ${pct(neg)}%</span></div>`;
    })();
    document.getElementById('sentimentSplit').innerHTML = html;
    document.getElementById('sentimentSplitOther').innerHTML = html;
  }

  // ---------------------------------------------
  // Per-post charts: sideways bars so titles can be read. The top 15 posts
  // are shown unless "Show all posts" is ticked.
  // ---------------------------------------------
  const TOP_POSTS_IN_CHART = 15;
  const showAllPosts = document.getElementById('showAllPosts');

  function pickPosts(data, sortFn) {
    const sorted = [...data].sort(sortFn);
    return showAllPosts.checked ? sorted : sorted.slice(0, TOP_POSTS_IN_CHART);
  }

  function sizeRowsChart(canvasId, rows) {
    const wrap = document.getElementById(canvasId).parentElement;
    wrap.style.height = `${Math.max(220, rows * (isMobileViewport() ? 30 : 26) + 70)}px`;
  }

  function rowLabel(title) {
    const max = isMobileViewport() ? 26 : 48;
    const t = title || '';
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  }

  function horizontalOptions(titleText, items, extra = {}) {
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: responsiveChartTitle(titleText),
        legend: responsiveLegend(),
        tooltip: { callbacks: { title: ctx => items[ctx[0].dataIndex].title } }
      },
      scales: {
        y: { ticks: { autoSkip: false, font: { size: isMobileViewport() ? 10 : 12 } }, ...(extra.y || {}) },
        x: { beginAtZero: true, ticks: { font: { size: isMobileViewport() ? 10 : 12 } }, ...(extra.x || {}) }
      },
      onClick: (evt, elements) => {
        if (elements.length > 0) fetchAndDisplayPostDetails(items[elements[0].index].postId);
      },
      onHover: (evt, elements) => {
        evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      ...(extra.interaction ? { interaction: extra.interaction } : {})
    };
  }

  // ---------------------------------------------
  // Chart 2: WEIGHTED SENTIMENT
  // ---------------------------------------------
   function renderWeightedSentimentChart(allData) {
    const data = pickPosts(allData, (a, b) => Math.abs(b.weightedSentimentScore) - Math.abs(a.weightedSentimentScore))
      .sort((a, b) => a.weightedSentimentScore - b.weightedSentimentScore);
    sizeRowsChart('weightedSentimentChart', data.length);
    const labels = data.map(post => rowLabel(post.title));
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
                label: 'Weighted sentiment',
                data: weightedScores,
                backgroundColor: backgroundColors
            }]
        },
        options: horizontalOptions('Weighted sentiment by post', data, { x: { beginAtZero: false } })
    });
  }

  // ---------------------------------------------
  // Chart 3: RAW SENTIMENT STACK (Stacked Sentiment)
  // ---------------------------------------------
  function renderSentimentStackChart(allData) {
      const total = p => Math.abs(p.totalPositiveSentiments || 0) + Math.abs(p.totalNegativeSentiments || 0);
      const data = pickPosts(allData, (a, b) => total(b) - total(a));
      sizeRowsChart('stackedSentimentChart', data.length);
      const labels = data.map(post => rowLabel(post.title));
      const positiveData = data.map(post => Math.abs(post.totalPositiveSentiments || 0));
      const negativeData = data.map(post => -Math.abs(post.totalNegativeSentiments || 0));

      const ctx = document.getElementById('stackedSentimentChart').getContext('2d');

      if (commentsSentimentChart) {
          commentsSentimentChart.destroy();
      }

      commentsSentimentChart = new Chart(ctx, {
          type: 'bar',
          data: {
              labels: labels,
              datasets: [
                  { label: 'Positive comments', data: positiveData, backgroundColor: 'rgba(46, 158, 143, 0.85)', stack: 'Stack 0' },
                  { label: 'Negative comments', data: negativeData, backgroundColor: 'rgba(217, 83, 79, 0.85)', stack: 'Stack 0' }
              ]
          },
          options: horizontalOptions('Positive and negative comments by post', data, {
              y: { stacked: true },
              x: { stacked: true, ticks: { callback: v => Math.abs(v), font: { size: isMobileViewport() ? 10 : 12 } } },
              interaction: { mode: 'index', axis: 'y', intersect: false }
          })
      });
      commentsSentimentChart.options.plugins.tooltip.callbacks.label = c => `${c.dataset.label}: ${Math.abs(c.raw)}`;
      commentsSentimentChart.update('none');
  }

  // ---------------------------------------------
  // Chart 4: ENGAGEMENT SCORE
  // ---------------------------------------------
  function renderEngagementScoreChart(allData) {
      const data = pickPosts(allData, (a, b) => b.engagementScore - a.engagementScore);
      sizeRowsChart('engagementScoreChart', data.length);
      const labels = data.map(post => rowLabel(post.title));
      const engagementScores = data.map(item => item.engagementScore);

      // Color remains here
      const backgroundColors = engagementScores.map(() => 'rgba(153, 102, 255, 0.8)');

      if (engagementScoreChart) {
          engagementScoreChart.destroy();
      }

      const ctx = document.getElementById('engagementScoreChart').getContext('2d');
      engagementScoreChart = new Chart(ctx, {
          type: 'bar',
          data: { labels, datasets: [{ label: 'Engagement score', data: engagementScores, backgroundColor: backgroundColors }] },
          options: horizontalOptions('Engagement by post', data)
      });
  }

  // ---------------------------------------------
  // Chart 5: TOTAL COMMENTS
  // ---------------------------------------------
  function renderCommentsCountChart(allData) {
      const data = pickPosts(allData, (a, b) => b.totalComments - a.totalComments);
      sizeRowsChart('totalCommentsChart', data.length);
      const labels = data.map(post => rowLabel(post.title));
      const totalComments = data.map(item => item.totalComments);

      // Color remains here
      const backgroundColors = totalComments.map(() => 'rgba(153, 102, 255, 0.8)'); // Consider a different color?

      if (totalCommentsChart) {
          totalCommentsChart.destroy();
      }

      const ctx = document.getElementById('totalCommentsChart').getContext('2d');
      totalCommentsChart = new Chart(ctx, {
          type: 'bar',
          data: { labels, datasets: [{ label: 'Comments', data: totalComments, backgroundColor: backgroundColors }] },
          options: horizontalOptions('Comments by post', data)
      });
  }

  async function fetchAndDisplayPostDetails(postId) {
    // 1. Open the modal popup
    openDrawer(); 
    const postDetailsContent = document.getElementById('post-details');
    postDetailsContent.innerHTML = '<p class="loading-message">Analyzing post details...</p>';

    // Identify the correct collection based on subreddit select
    const selectedSubreddit = document.getElementById('subreddit-select').value.toLowerCase();
    const postsCollection = (selectedSubreddit === "temasekpoly") ? "posts" : `${selectedSubreddit}_posts`;

    try {
        const postRef = doc(db, postsCollection, postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) {
            postDetailsContent.innerHTML = `<div class="details-message error">Post not found.</div>`;
            return;
        }

        const postData = postSnap.data();
        const date = postData.created?.toDate ? postData.created.toDate() : new Date(postData.created);
        const formattedDate = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        // 2. Construct Navigation Bar
        // Note: The button uses class="close-drawer-btn" which is handled by your central listener
        const navHtml = `
          <div class="modal-nav-container">
              <div style="display:flex; gap:10px; margin-left: auto;">
                  <button class="pdf-export-btn" id="downloadPDFBtn">📄 Download PDF</button>
                  <button class="close-drawer-btn">✕ Close</button>
              </div>
          </div>`;

        const header = `<h2 class="post-details-title"><a href="${safeUrl(postData.URL)}" target="_blank" rel="noopener noreferrer">${escapeHtml(postData.title)}</a></h2>`;
        const meta = `<p class="post-details-meta">By <strong>${escapeHtml(postData.author)}</strong> on ${formattedDate}</p>`;
        const badges = `<div class="post-details-badges">${generateBadgesHtml(postData)}</div>`;
        const summary = `<div class="post-details-summary"><h4 class="summary-title">AI Summary</h4><p class="summary-text">${postData.summary ? textToHtml(postData.summary) : 'N/A'}</p></div>`;
        const body = `<div class="post-details-body-container"><h4 class="body-title">Post Content</h4><div class="body-content">${textToHtml(postData.body)}</div></div>`;

        // 3. Fetch Comments
        const commentsSnapshot = await getDocs(collection(db, `${postsCollection}/${postId}/comments`));
        let commentsHtml = `<h3 class="post-details-comments-title">Comments (${commentsSnapshot.size})</h3>`;
        
        commentsSnapshot.forEach(cDoc => {
            const c = cDoc.data();
            commentsHtml += `
                <div class="post-details-comment">
                    <p class="comment-meta"><strong>${escapeHtml(c.author || 'Anon')}</strong></p>
                    <p class="comment-body">${textToHtml(c.body)}</p>
                    <div class="comment-badges">${generateCommentBadgesHtml(c)}</div>
                </div>`;
        });

        // 4. Final Render
        // We do NOT add .addEventListener here. The central listener at the top of script.js handles it.
        postDetailsContent.innerHTML = `
            <div class="post-details-wrapper">
                ${navHtml}
                ${header}
                ${meta}
                ${badges}
                ${summary}
                ${body}
                ${commentsHtml}
            </div>`;

    } catch (err) {
        console.error("Modal Error:", err);
        postDetailsContent.innerHTML = `<div class="details-message error">Error loading details. Please check console for technical info.</div>`;
    }
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
      case 'topEngaged': // "Most discussed": most comments first
        selectedPosts.sort((a, b) => b.totalComments - a.totalComments);
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
            <th>Post</th>
            <th>Date</th>
            <th>Comments</th>
            <th>Sentiment</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const p of posts) {
      const ws = p.weightedSentimentScore || 0;
      const mood = ws > 0 ? 'Positive' : (ws < 0 ? 'Negative' : 'Neutral');
      const date = p.created instanceof Date ? p.created.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      html += `
        <tr data-post-id="${escapeHtml(p.postId)}" class="post-list-row">
          <td>${escapeHtml(p.title)}</td>
          <td>${date}</td>
          <td>${p.totalComments}</td>
          <td><span class="ui-mood ui-mood--${mood.toLowerCase()}">${mood}</span> <span class="ui-muted">${ws.toFixed(2)}</span></td>
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
        maintainAspectRatio: false, // height comes from .chart-canvas-wrap
        plugins: {
          title: responsiveChartTitle('Top 10 Authors with Most Negative Sentiments'),
          legend: responsiveLegend(),
          tooltip: {
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.raw}`;
              }
            }
          }
        },
        scales: {
          x: { stacked: true, ticks: responsiveCategoryTicks() },
          y: { stacked: true, beginAtZero: true, ticks: { font: { size: isMobileViewport() ? 10 : 12 } } }
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
            maintainAspectRatio: false, // height comes from .chart-canvas-wrap--tall
            plugins: {
                title: responsiveChartTitle('Time Series of Average Sentiment by Category'),
                zoom: responsiveZoomOptions(),
                tooltip: { mode: 'index', intersect: false },
                legend: { // Legend customization remains
                    // Many categories: move the legend below the plot on phones
                    // so it stops eating the chart's width.
                    position: isMobileViewport() ? 'bottom' : 'top',
                    labels: {
                        boxWidth: isMobileViewport() ? 10 : 40,
                        padding: isMobileViewport() ? 6 : 10,
                        font: { size: isMobileViewport() ? 10 : 12 },
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
                    // Axis titles are redundant on a phone-width chart.
                    title: { display: !isMobileViewport(), text: 'Date' },
                    ticks: {
                        autoSkip: true,
                        maxTicksLimit: isMobileViewport() ? 5 : 12,
                        maxRotation: isMobileViewport() ? 45 : 0,
                        font: { size: isMobileViewport() ? 9 : 12 }
                    }
                },
                y: {
                    min: -1.2, max: 1.2, beginAtZero: false,
                    title: { display: !isMobileViewport(), text: 'Average Sentiment' },
                    ticks: { font: { size: isMobileViewport() ? 9 : 12 } }
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

  async function fetchAndDisplayPostsByCategoryAndDate(category, dateStr) {
    // Open the modal
    openDrawer();
    const container = document.getElementById('post-details');
    container.innerHTML = `<div class="details-message loading">Loading activity...</div>`;

    const subredditSelect = document.getElementById('subreddit-select');
    const selectedSubreddit = subredditSelect.value;
    const lowerSub = selectedSubreddit.toLowerCase();
    const postsCollection = (lowerSub === "temasekpoly") ? "posts" : `${lowerSub}_posts`;
    const categoryCollection = (lowerSub === "temasekpoly") ? "category_stats" : `${lowerSub}_category_stats`;

    try {
        const statsDocRef = doc(db, categoryCollection, dateStr);
        const statsDocSnap = await getDoc(statsDocRef);

        if (!statsDocSnap.exists()) {
            container.innerHTML = `<div class="details-message info">No activity data found for date <strong>${escapeHtml(dateStr)}</strong>. Cannot check category ${escapeHtml(category)}.</div>`;
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
            container.innerHTML = `<div class="details-message info">No posts or comments found specifically matching category <strong>${escapeHtml(category)}</strong> (or its variations like ${escapeHtml(lowerCategory)}/${escapeHtml(upperCategory)}) on ${escapeHtml(dateStr)}.</div>`;
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
        const navHtml = `
          <div class="modal-nav-container">
              <div style="display:flex; gap:10px; margin-left: auto;">
                  <button class="pdf-export-btn" id="downloadPDFBtn">📄 Download PDF</button>
                  <button class="close-drawer-btn">✕ Close</button>
              </div>
          </div>`;

        let html = `
            <div class="category-date-details-wrapper">
                ${navHtml}
                <h2 class="category-date-title">Category: ${escapeHtml(category)} on ${escapeHtml(dateStr)}</h2>
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
                                <a href="${safeUrl(postUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(postTitle)}</a>
                            </h4>
                            <p class="post-meta">By <strong>${escapeHtml(author)}</strong> on ${formattedPostDate}</p>
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
                                In Post: <span class="parent-post-title">"${escapeHtml(parentPostTitle)}"</span> (Comment by <strong>${escapeHtml(author)}</strong> on ${formattedDate})
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
        html += `</div>`;
        container.innerHTML = html;

    } catch (error) {
        console.error(`Error fetching details for category ${category} on ${dateStr}:`, error);
        container.innerHTML = `<div class="details-message error">An error occurred while fetching activity details. Please check the console or try again later.</div>`;
    }
}

const SCHOOL_NAMES = {
    ASC: 'Applied Science', BUS: 'Business', DES: 'Design', ENG: 'Engineering',
    HSS: 'Humanities & Social Sciences', IIT: 'Informatics & IT'
};

// The crawler stores "schoolTags" on each post: a list of
// {school, diploma, diplomaName, evidence: [...]}.
// An empty list means the post was checked and names no particular school.
// Posts never checked under the current rules are not linked to any school.
// Tags written under the first, looser rules (no schoolTagsVersion, or below
// SCHOOL_TAGS_VERSION) were often wrong, so they are treated as not checked.
const SCHOOL_TAGS_VERSION = 2;

function hasCurrentSchoolTags(data) {
    return Array.isArray(data.schoolTags) && (data.schoolTagsVersion || 0) >= SCHOOL_TAGS_VERSION;
}

function schoolTagFor(postData, schoolCode) {
    if (!hasCurrentSchoolTags(postData)) return null;
    return postData.schoolTags.find(t => t.school === schoolCode) || null;
}

// "linked" (checked, names a school), "general" (checked, names no school) or
// "unchecked" (not yet checked under the current rules).
function schoolStatus(postData) {
    if (hasCurrentSchoolTags(postData)) return postData.schoolTags.length ? 'linked' : 'general';
    return 'unchecked';
}

function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// One short line under the Overview figures: how many posts in the period
// name the chosen school, and what is left out.
let lastSchoolCoverage = null;

function renderSchoolCoverage(useSchools, schoolCode, c) {
    lastSchoolCoverage = useSchools ? { schoolCode, ...c } : null;
    const box = document.getElementById('schoolCoverage');
    const text = document.getElementById('schoolCoverageText');
    if (!box || !text) return;
    if (!useSchools || c.total === 0) {
        box.hidden = true;
        return;
    }
    const parts = [];
    const b = n => `<strong>${n}</strong>`;
    if (schoolCode) {
        const schoolName = escapeHtml(SCHOOL_NAMES[schoolCode] || schoolCode);
        parts.push(`${b(c.shown)} ${c.shown === 1 ? 'post names' : 'posts name'} ${schoolName}`);
        parts.push(`${b(c.general)} general TP ${c.general === 1 ? 'post' : 'posts'} not shown (choose All schools to see them)`);
        if (c.unchecked) parts.push(`${b(c.unchecked)} not yet checked for schools`);
    } else {
        parts.push(`${b(c.linked)} ${c.linked === 1 ? 'post names' : 'posts name'} a school`);
        parts.push(`${b(c.general)} about TP in general`);
        if (c.unchecked) parts.push(`${b(c.unchecked)} not yet checked for schools`);
    }
    text.innerHTML = parts.map(p => `<span>${p}</span>`).join('') +
        '<a href="about.html#school-filter-help">How posts are linked to schools</a>';
    box.hidden = false;
}

// Shows which schools a post or comment is linked to, and why.
function schoolReasonsHtml(data) {
    if (!hasCurrentSchoolTags(data)) return '';
    if (data.schoolTags.length === 0) {
        return `<div class="school-reasons"><span class="school-tag school-tag--none">General TP, no school named</span></div>`;
    }
    const rows = data.schoolTags.map(t => {
        const name = escapeHtml(SCHOOL_NAMES[t.school] || t.school);
        const diploma = t.diplomaName ? `, ${escapeHtml(t.diplomaName)}` : '';
        const evidence = (t.evidence || []).map(e => `&ldquo;${escapeHtml(e)}&rdquo;`).join(', ');
        return `<div class="school-reason"><span class="school-tag school-tag--clear">${name}${diploma}</span>` +
               (evidence ? ` <span class="school-evidence">Evidence: ${evidence}</span>` : '') + `</div>`;
    });
    return `<div class="school-reasons">${rows.join('')}</div>`;
}

function schoolFilterApplies(lowerSub) {
    return lowerSub === 'temasekpoly' || lowerSub === 'sgexams';
}

// --- Alerts tab -------------------------------------------------------------
// Alert documents are written by alerts.py; all text is escaped here.
// Which polytechnic each forum is about. r/SGExams is shown for TP, as its
// "TP-related only" filter is.
const FORUM_POLY = {
    temasekpoly: 'TP', sgexams: 'TP', nyp: 'NYP', nanyangpoly: 'NYP',
    republicpolytechnic: 'RP', singaporepoly: 'SP', ngeeannpoly: 'NP'
};
const POLY_NAMES = {
    TP: 'Temasek Polytechnic', NYP: 'Nanyang Polytechnic', RP: 'Republic Polytechnic',
    SP: 'Singapore Polytechnic', NP: 'Ngee Ann Polytechnic'
};

// Alerts saved before alerts listed their polytechnics were all about TP.
function alertPolys(a) {
    if (Array.isArray(a.polytechnics)) return a.polytechnics;
    return (a.subreddit === 'temasekpoly' || a.subreddit === 'sgexams') ? ['TP'] : [];
}

// The alerts for one polytechnic, and for one TP school when one is chosen.
function alertsFor(alerts, poly, school) {
    return alerts.filter(a => alertPolys(a).includes(poly) &&
        (poly !== 'TP' || !school || (a.schoolStatus === 'linked' && (a.schools || []).includes(school))));
}

const ALERT_KIND_LABELS = {
    'wellbeing': 'Wellbeing', 'safety': 'Safety', 'harassment': 'Harassment',
    'academic integrity': 'Academic integrity', 'serious complaint': 'Serious complaint', 'other': 'Other'
};

function alertSchoolText(a) {
    if (a.schoolStatus === 'linked' && Array.isArray(a.schools) && a.schools.length) {
        return a.schools.map(s => escapeHtml(SCHOOL_NAMES[s] || s)).join(', ');
    }
    if (a.schoolStatus === 'general') return 'General TP, no school named';
    if (!alertPolys(a).includes('TP')) return '';
    return 'Not yet checked for schools';
}

function alertSourceText(a) {
    const sub = `r/${escapeHtml(a.subreddit)}`;
    if (FORUM_POLY[a.subreddit] && a.subreddit !== 'sgexams') return sub;
    const names = alertPolys(a).map(c => escapeHtml(POLY_NAMES[c] || c));
    return names.length ? `${sub}, names ${names.join(' and ')}` : sub;
}

// Personal names found by AI in an alert (maskNames) are hidden until the
// reader asks to see them. The text is escaped here.
function maskNamesHtml(text, names) {
    const list = (names || []).filter(n => n && n.length >= 2);
    if (!list.length) return escapeHtml(text);
    const re = new RegExp(`(${list.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return String(text || '').split(re).map((part, i) =>
        i % 2 ? '<span class="name-mask" title="Name hidden">name hidden</span>' : escapeHtml(part)).join('');
}

// A Reddit link without the title words, which can hold a name.
function linkWithoutSlug(url) {
    return String(url || '').replace(/(\/comments\/[a-z0-9]+)\/[^/?#]+\/?/i, '$1/');
}

function alertTextHtml(a) {
    const names = Array.isArray(a.maskNames) ? a.maskNames : [];
    const plain = `<a href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(a.title)}</strong></a>
          <p>${escapeHtml(a.reason)}</p>`;
    if (!names.length) return plain;
    return `<div class="alert-text">
            <a href="${safeUrl(linkWithoutSlug(a.url))}" target="_blank" rel="noopener noreferrer"><strong>${maskNamesHtml(a.title, names)}</strong></a>
            <p>${maskNamesHtml(a.reason, names)}</p></div>
          <div class="alert-text" hidden>${plain}</div>
          <p class="alert-name-note">A person's name appears in this public post, so it is hidden here. <button type="button" class="ui-link" data-show-names>Show name</button></p>`;
}

// alerts: already narrowed to one polytechnic (and school, if chosen).
function renderAlertsHtml(alerts, schoolFilter, opts = {}) {
    const shown = alerts;
    if (!shown.length) {
        return '<p class="details-message info">No alerts in this period.</p>';
    }
    const unchecked = shown.filter(a => a.schoolStatus === 'unchecked').length;
    const items = shown.map(a => {
        const when = a.alertedAt && a.alertedAt.toDate
            ? a.alertedAt.toDate().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })
            : escapeHtml(a.date || '');
        const urgency = a.urgency === 'high' ? 'high' : 'normal';
        return `<li class="alert-item alert-item--${urgency}">
          <div class="alert-head"><span class="alert-badge alert-badge--${urgency}">${urgency === 'high' ? 'High' : 'Normal'}</span>
            <span class="alert-kind">${escapeHtml(ALERT_KIND_LABELS[a.kind] || a.kind || '')}</span></div>
          ${alertTextHtml(a)}
          <p class="alert-meta">${[alertSourceText(a), plural(a.totalComments || 0, 'comment'), `alerted ${when}`, opts.tp ? alertSchoolText(a) : ''].filter(Boolean).join(' · ')}</p>
        </li>`;
    });
    if (opts.compact) return `<ul class="alert-list">${items.join('')}</ul>`;
    let html = `<p>${plural(shown.length, 'alert')}.</p><ul class="alert-list">${items.join('')}</ul>`;
    if (opts.tp && schoolFilter === '' && unchecked) {
        html += `<p class="digest-note">${plural(unchecked, 'alert')} ${unchecked === 1 ? 'is on a post' : 'are on posts'} not yet checked for schools, so ${unchecked === 1 ? 'it shows' : 'they show'} only under All of TP.</p>`;
    }
    return html;
}

function pctText(x) {
    return (x === null || x === undefined) ? 'n/a' : `${Math.round(x * 100)}%`;
}

function digestChangeSentence(d) {
    if (d.negativeShare === null || d.negativeShare === undefined) return 'No posts were linked to this school in this week.';
    if (d.baselineNegativeShare === null || d.baselineNegativeShare === undefined) {
        return `${pctText(d.negativeShare)} of posts were negative. There is not enough history to compare yet.`;
    }
    const diff = d.negativeShare - d.baselineNegativeShare;
    const trend = Math.abs(diff) < 0.05 ? 'about the same as' : (diff > 0 ? 'higher than' : 'lower than');
    return `${pctText(d.negativeShare)} of posts were negative, ${trend} the average of ${pctText(d.baselineNegativeShare)} over ${plural(d.baselineWeeks, 'earlier week')}.`;
}

// The digest documents are written by digest.py; all text is escaped here.
function renderDigestHtml(d) {
    const postLink = p => `<li><a href="${safeUrl(p.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.title)}</a> (${plural(p.comments || 0, 'comment')})</li>`;
    let html = `<h3 class="digest-title">${escapeHtml(d.schoolName)}</h3>
      <p class="digest-week">Week of ${escapeHtml(d.weekStart)} to ${escapeHtml(d.weekEnd)}</p>
      <p><strong>${plural(d.postCount || 0, 'post')}</strong> and <strong>${plural(d.commentCount || 0, 'comment')}</strong>. ${escapeHtml(digestChangeSentence(d))}</p>`;
    if (d.overview) html += `<p>${escapeHtml(d.overview)}</p>`;
    if (Array.isArray(d.issues) && d.issues.length) {
        html += '<h4>Issues to look at</h4><ol class="digest-issues">';
        for (const issue of d.issues) {
            html += `<li><strong>${escapeHtml(issue.title)}</strong>
              <p>${escapeHtml(issue.whatStudentsSay)}</p>
              <p><em>Possible follow-up:</em> ${escapeHtml(issue.possibleFollowUp)}</p>
              <ul>${(issue.posts || []).map(postLink).join('')}</ul></li>`;
        }
        html += '</ol>';
    } else {
        html += '<p>No issues stood out this week.</p>';
    }
    if (Array.isArray(d.negativeThreads) && d.negativeThreads.length) {
        html += `<h4>Most negative threads</h4><ul>${d.negativeThreads.map(postLink).join('')}</ul>`;
    }
    if (d.school !== 'TP' && d.tpPosts !== undefined) {
        let note = `A post is counted for a school only when it names the school, one of its diplomas, modules or facilities. Of the ${plural(d.tpPosts, 'TP post')} this week, ${d.generalPosts || 0} ${(d.generalPosts || 0) === 1 ? 'names' : 'name'} no school (general TP)`;
        if (d.uncheckedPosts) note += `, and ${d.uncheckedPosts} ${d.uncheckedPosts === 1 ? 'has' : 'have'} not been checked for schools yet`;
        html += `<p class="digest-note">${escapeHtml(note)}. These are not counted here.</p>`;
    }
    return html;
}

// Reddit posts, comments and AI summaries are untrusted text. Always pass
// them through these helpers before putting them into innerHTML.
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// Escaped text with line breaks kept.
function textToHtml(text) {
    return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

// Only allow http(s) links, so a stored "javascript:" URL cannot run.
function safeUrl(url) {
    if (!url) return '#';
    try {
        const parsed = new URL(String(url));
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return escapeHtml(parsed.href);
        }
    } catch (e) { /* fall through */ }
    return '#';
}

  // For clicking on the authors chart bars
  async function fetchAndDisplayPostsAndCommentsByAuthor(authorName) {
    openDrawer();
    const container = document.getElementById('post-details');
    container.innerHTML = `<div class="details-message loading">Loading ${escapeHtml(authorName)}'s activity...</div>`;

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
            container.innerHTML = `<div class="details-message info">No activity data found for author: <strong>${escapeHtml(authorName)}</strong>.</div>`;
            return;
        }

        const authorData = authorSnap.data();
        const postIds = authorData.posts || [];
        const commentsMap = authorData.comments || {}; // { postId: [commentId1, commentId2], ... }

        // Start building HTML (removed inline styles, using classes)
        const navHtml = `
          <div class="modal-nav-container">
              <div style="display:flex; gap:10px; margin-left: auto;">
                  <button class="pdf-export-btn" id="downloadPDFBtn">📄 Download PDF</button>
                  <button class="close-drawer-btn">✕ Close</button>
              </div>
          </div>`;

        let html = `
          <div class="author-details-wrapper">
            ${navHtml}
            <h2 class="author-details-title">Activity by ${escapeHtml(authorName)}</h2>
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
                          <a href="${safeUrl(postUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(postTitle)}</a>
                        </h4>
                        <p class="post-meta">Posted on ${formattedPostDate}</p>
                        <p class="post-body-excerpt">
                          ${postBody ? escapeHtml(postBody) : '<i>No body content</i>'}
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
                              In Post: <span class="parent-post-title">"${escapeHtml(parentPostTitle)}"</span> (On ${formattedCommentDate})
                          </p>
                          <p class="comment-body">
                              ${commentBody ? escapeHtml(commentBody) : '<i>No comment body.</i>'}
                          </p>
                          <div class="comment-badges">${commentBadges}</div>
                          <button class="view-full-post-btn view-thread-btn" data-post-id="${commentPostId}">
                              View Post Thread
                          </button>
                      </div>
                    `;
                } else {
                    // Optional: Handle missing comment
                }
            });
        }

        html += `</div>`;
        container.innerHTML = html;

    }
    catch (error) {
        console.error(`Error fetching details for author ${authorName}:`, error);
         // Use class for error message
        container.innerHTML = `<div class="details-message error">Error fetching details for <strong>${escapeHtml(authorName)}</strong>. Please check the console.</div>`;
    }
}


  // ---------------------------------------------
  // NEW: KEYWORD SEARCH FUNCTIONALITY
  // ---------------------------------------------

  // Function to highlight keyword in text (remains the same)
  // Escapes the text, then wraps each match of the keyword in <mark>.
  function highlightKeyword(text, keyword) {
    if (!text) return '';
    if (!keyword) return escapeHtml(text);
    const pattern = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const parts = String(text).split(new RegExp(`(${pattern})`, 'gi'));
    // split() with a capture group puts the matches at the odd positions.
    return parts.map((part, i) => i % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)).join('');
  }

  // Function to perform search across posts and comments
  async function searchByKeyword() {
    const keyword = keywordInput.value.trim();
    if (!keyword) {
      keywordInput.focus();
      return;
    }
    // Open the modal immediately and show loading
    openDrawer();
    const postDetailsContainer = document.getElementById('post-details');
    postDetailsContainer.innerHTML = `<p class="loading-message">Searching for "${escapeHtml(keyword)}"...</p>`;

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
    // Create the Navigation Bar with PDF Button
    const navHtml = `
      <div class="modal-nav-container">
          <div style="display:flex; gap:10px; margin-left: auto;">
              <button class="pdf-export-btn" id="downloadPDFBtn">📄 Download PDF</button>
              <button class="close-drawer-btn">✕ Close</button>
          </div>
      </div>`;

    if (posts.length === 0 && comments.length === 0) {
        postDetailsContainer.innerHTML = `
          <div class="search-results-wrapper no-results">
            ${navHtml}
            <h2 class="search-results-title">Search Results</h2>
            <p class="search-no-results-message">No results found matching "<strong>${escapeHtml(keyword)}</strong>".</p>
          </div>`;
        return;
    }

    let html = `
      <div class="search-results-wrapper">
        ${navHtml}
        <h2 class="search-results-title">Search Results for "${escapeHtml(keyword)}"</h2>
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
                  <a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${highlightKeyword(postTitle, keyword)}</a>
                </h4>
                <p class="post-meta">By <strong>${escapeHtml(author)}</strong> on ${formattedDate}</p>
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
                      Comment by <strong>${escapeHtml(author)}</strong> on ${formattedDate}
                      (in post: <span class="parent-post-title">"${escapeHtml(parentPostTitle)}"</span>)
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

    html += `</div>`;
    postDetailsContainer.innerHTML = html;
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
      ${schoolReasonsHtml(postData)}
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
      ${schoolReasonsHtml(commentData)}
    `;
  }

  // ---------------------------------------------
  // Main "updateCharts" logic
  // ---------------------------------------------
  // Previous period of the same length, for the "Negative posts" comparison.
  function previousRange() {
    const start = new Date(`${startDateInput.value}T00:00:00`);
    const end = new Date(`${endDateInput.value}T00:00:00`);
    const days = Math.round((end - start) / 86400000) + 1;
    const prevEnd = new Date(start); prevEnd.setDate(start.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - (days - 1));
    return { start: isoDate(prevStart), end: isoDate(prevEnd), days };
  }

  const negShare = posts => posts.length ? posts.filter(p => p.weightedSentimentScore < 0).length / posts.length : null;

  let lastPrevPosts = null;
  async function updateNegativeComparison(share) {
    const change = document.getElementById('negativeShareChange');
    lastPrevPosts = null;
    if (share === null) { change.textContent = 'No posts in this period'; return; }
    change.textContent = '';
    try {
      const prev = previousRange();
      const prevPosts = await fetchPostsInRange(prev);
      lastPrevPosts = prevPosts;
      renderOverviewIssueGroups(allPostsData, prevPosts);
      const before = negShare(prevPosts);
      if (before === null) { change.textContent = `No posts in the previous ${prev.days} days to compare`; return; }
      const diff = share - before;
      const word = Math.abs(diff) < 0.05 ? 'About the same as' : (diff > 0 ? 'Up from' : 'Down from');
      change.innerHTML = `<span class="${Math.abs(diff) < 0.05 ? '' : (diff > 0 ? 'ui-up' : 'ui-down')}">${word}</span> ${Math.round(before * 100)}% in the previous ${prev.days} days`;
    } catch (err) {
      console.error('Error loading previous period', err);
    }
  }

  // Why a view is empty, in plain words. With a school chosen, the usual
  // reason is that no post in the period names that school.
  function emptyPeriodText() {
    const c = lastSchoolCoverage;
    if (c && c.schoolCode && c.total > 0) {
      const name = SCHOOL_NAMES[c.schoolCode] || c.schoolCode;
      let t = `No post in this period names ${name}.`;
      if (c.general) t += ` ${plural(c.general, 'post')} ${c.general === 1 ? 'is' : 'are'} about TP in general: choose "All schools" to see ${c.general === 1 ? 'it' : 'them'}, or choose a longer period.`;
      if (c.unchecked) t += ` ${plural(c.unchecked, 'post')} ${c.unchecked === 1 ? 'has' : 'have'} not been checked for schools yet.`;
      return t;
    }
    return 'No posts in this period.';
  }

  // Issues: posts grouped by AI into specific problems (issues.py). An issue
  // counts as raised before if a post in the previous period of the same
  // length had the same issue.
  const MIN_ISSUE_POSTS = 2;
  const MAX_ISSUES_SHOWN = 8;
  let issueGroupsOpen = '';

  function renderOverviewIssueGroups(data, prevData = null) {
    const box = document.getElementById('overviewIssueGroups');
    const groups = {};
    data.forEach(p => {
      const d = p.postDetails || {};
      if (!d.issueId) return;
      const g = groups[d.issueId] || (groups[d.issueId] = { id: d.issueId, label: d.issueLabel || d.issueId, posts: [] });
      g.posts.push(p);
    });
    const all = Object.values(groups).map(g => ({
      ...g,
      comments: g.posts.reduce((n, p) => n + (p.totalComments || 0), 0),
      negative: g.posts.filter(p => p.weightedSentimentScore < 0).length
    })).sort((a, b) => b.posts.length - a.posts.length || b.comments - a.comments);
    const shown = all.filter(g => g.posts.length >= MIN_ISSUE_POSTS).slice(0, MAX_ISSUES_SHOWN);
    const single = all.filter(g => g.posts.length < MIN_ISSUE_POSTS).length;
    if (!data.length) { box.innerHTML = `<p class="ui-muted">${emptyPeriodText()}</p>`; return; }
    if (!all.length) {
      box.innerHTML = '<p class="ui-muted">No posts in this period have been grouped into issues yet.</p>';
      return;
    }
    const before = new Set();
    if (prevData) prevData.forEach(p => { const id = (p.postDetails || {}).issueId; if (id) before.add(id); });
    const prevDays = previousRange().days;
    const rows = shown.map(g => {
      const open = g.id === issueGroupsOpen;
      const repeat = prevData && before.has(g.id)
        ? `<span class="ui-issue-tag" title="At least one post in the previous ${prevDays} days raised this too">Also raised in the previous ${prevDays} days</span>` : '';
      const posts = open ? '<ul class="ui-issue-posts">' + [...g.posts].sort((a, b) => b.totalComments - a.totalComments).map(p =>
        `<li><button type="button" class="ui-link" data-post-id="${escapeHtml(p.postId)}">${escapeHtml(p.title)}</button> <span class="ui-muted ui-small">${plural(p.totalComments || 0, 'comment')}</span></li>`).join('') + '</ul>' : '';
      return `<li class="ui-issue${open ? ' open' : ''}">
        <button type="button" class="ui-issue-head" data-issue="${escapeHtml(g.id)}" aria-expanded="${open}">
          <strong>${escapeHtml(g.label)}</strong>
          <span class="ui-muted ui-small">${plural(g.posts.length, 'post')} · ${plural(g.comments, 'comment')} · ${g.negative} negative</span>
        </button>${repeat}${posts}</li>`;
    }).join('');
    let html = shown.length
      ? `<ul class="ui-issue-list">${rows}</ul>`
      : '<p class="ui-muted">No issue came up in more than one post in this period.</p>';
    if (single) html += `<p class="ui-muted ui-small">${plural(single, 'other issue')} came up in only one post${single === 1 ? '' : ' each'}.</p>`;
    html += '<p class="ui-muted ui-small">Posts are grouped by AI into specific problems, such as a timetable clash or a broken facility. Posts that raise no specific problem are not counted. Click an issue to see its posts.</p>';
    box.innerHTML = html;
  }
  document.getElementById('overviewIssueGroups').addEventListener('click', e => {
    const post = e.target.closest('[data-post-id]');
    if (post) { fetchAndDisplayPostDetails(post.dataset.postId); return; }
    const head = e.target.closest('[data-issue]');
    if (!head) return;
    issueGroupsOpen = issueGroupsOpen === head.dataset.issue ? '' : head.dataset.issue;
    renderOverviewIssueGroups(allPostsData, lastPrevPosts);
  });

  function renderOverviewTopPosts(data) {
    const container = document.getElementById('overviewTopPosts');
    const top = [...data].sort((a, b) => b.totalComments - a.totalComments).slice(0, 8);
    if (!top.length) { container.innerHTML = `<p class="ui-muted">${emptyPeriodText()}</p>`; return; }
    const max = Math.max(1, ...top.map(p => Math.abs(p.totalPositiveSentiments || 0) + Math.abs(p.totalNegativeSentiments || 0)));
    container.innerHTML = '<div class="ui-legend"><span class="ui-pos">Positive comments</span><span class="ui-neg">Negative comments</span></div>' +
      '<div class="ui-bars">' + top.map(p => {
        const pos = Math.abs(p.totalPositiveSentiments || 0), neg = Math.abs(p.totalNegativeSentiments || 0);
        return `<button type="button" class="ui-bar" data-post-id="${escapeHtml(p.postId)}">
          <span class="ui-bar-lbl">${escapeHtml(p.title)}</span>
          <span class="ui-track"><i class="ui-pos" style="width:${pos / max * 100}%"></i><i class="ui-neg" style="width:${neg / max * 100}%"></i></span>
          <span class="ui-bar-n" title="Comments">${p.totalComments}</span></button>`;
      }).join('') + '</div>';
  }
  // "Show name" on an alert reveals the names for that alert only.
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-show-names]');
    if (!btn) return;
    const item = btn.closest('.alert-item');
    const [masked, plain] = item.querySelectorAll('.alert-text');
    const show = plain.hidden;
    plain.hidden = !show;
    masked.hidden = show;
    btn.textContent = show ? 'Hide name' : 'Show name';
  });
  document.getElementById('overviewTopPosts').addEventListener('click', e => {
    const row = e.target.closest('[data-post-id]');
    if (row) fetchAndDisplayPostDetails(row.dataset.postId);
  });

  // Digests and school filters cover TP only (r/TemasekPoly and TP posts on r/SGExams).
  const coversTp = () => schoolFilterApplies(document.getElementById('subreddit-select').value.toLowerCase());

  const forumPoly = () => FORUM_POLY[document.getElementById('subreddit-select').value.toLowerCase()] || '';

  async function updateOverviewTpCards() {
    const tp = coversTp();
    const poly = forumPoly();
    document.getElementById('tpOnlyCards').hidden = !poly;
    document.getElementById('issuesCard').hidden = !tp;
    document.getElementById('otherForumFeel').hidden = tp;
    document.getElementById('alertsKpi').hidden = !poly;
    if (!poly) { document.getElementById('alerts-badge').hidden = true; return; }
    // Alerts: the chosen period, for this polytechnic (and the chosen TP school)
    const alertsBox = document.getElementById('overviewAlerts');
    try {
      const alerts = await alertsInPeriod();
      const shown = alertsFor(alerts, poly, tp ? document.getElementById('school-filter').value : '');
      const high = shown.filter(a => a.urgency === 'high').length;
      document.getElementById('alertsCount').textContent = shown.length;
      document.getElementById('alertsCountNote').textContent = shown.length ? `${periodText()}, ${high} high urgency` : periodText();
      const badge = document.getElementById('alerts-badge');
      badge.textContent = shown.length;
      badge.hidden = shown.length === 0;
      alertsBox.innerHTML = shown.length
        ? renderAlertsHtml(shown.slice(0, 3), '', { compact: true, tp })
        : '<p class="ui-muted">No alerts in this period.</p>';
    } catch (err) {
      console.error('Error loading alerts for overview', err);
      document.getElementById('alertsCount').textContent = '-';
      alertsBox.innerHTML = '<p class="ui-muted">Could not load the alerts.</p>';
    }
    if (!tp) return;
    // Issues: the latest weekly digest for the chosen school
    const issuesBox = document.getElementById('overviewIssues');
    try {
      const code = document.getElementById('school-filter').value || 'TP';
      const latest = (await digestWeeksFor(code))[0];
      if (!latest) {
        issuesBox.innerHTML = '<p class="ui-muted">No digest yet. Digests are made every Monday morning.</p>';
      } else {
        const d = latest;
        const issues = Array.isArray(d.issues) ? d.issues : [];
        issuesBox.innerHTML = issues.length
          ? '<ol class="ui-issues">' + issues.map(i => `<li><strong>${escapeHtml(i.title)}</strong><div class="ui-muted ui-small">${plural((i.posts || i.postIds || []).length, 'post')}</div></li>`).join('') +
            `</ol><p class="ui-muted ui-small">From the digest for the week of ${escapeHtml(weekLabel(d.weekStart))}.</p>`
          : `<p class="ui-muted">No issues stood out in the week of ${escapeHtml(weekLabel(d.weekStart))}.</p>`;
      }
    } catch (err) {
      console.error('Error loading digest for overview', err);
      issuesBox.innerHTML = '<p class="ui-muted">Could not load the digest.</p>';
    }
  }

  const weekLabel = iso => {
    const d = new Date(`${iso}T00:00:00Z`);
    return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  async function updateCharts() {
    try {
      allPostsData = await fetchPostsInRange();

      document.querySelector("#postCount .postCount-number").textContent = allPostsData.length;
      document.querySelectorAll('[data-period-text]').forEach(el => { el.textContent = periodText(); });

      if (allPostsData.length > 0) {
        const sum = allPostsData.reduce((acc, post) => acc + post.weightedSentimentScore, 0);
        let formattedAvg = (sum / allPostsData.length).toFixed(2);
        if (formattedAvg === "-0.00") formattedAvg = "0.00";
        document.getElementById("avgWeightedScoreNumber").textContent = formattedAvg;
        const totalComments = allPostsData.reduce((acc, post) => acc + post.totalComments, 0);
        document.getElementById("commentsCountNumber").textContent = totalComments;
      } else {
        document.getElementById("avgWeightedScoreNumber").textContent = "N/A";
        document.getElementById("commentsCountNumber").textContent = "0";
      }
      const share = negShare(allPostsData);
      document.getElementById('negativeShare').textContent = share === null ? '-' : `${Math.round(share * 100)}%`;

      // Overview
      renderSentimentSplit(allPostsData);
      renderOverviewTopPosts(allPostsData);
      renderOverviewIssueGroups(allPostsData);
      updateNegativeComparison(share);
      updateOverviewTpCards();

      // Trends
      renderWeightedSentimentChart(allPostsData);
      renderSentimentStackChart(allPostsData);
      renderEngagementScoreChart(allPostsData);
      renderCommentsCountChart(allPostsData);
      updateTimeSeriesChart();
      updateAuthorsChart();

      // Posts list keeps the chosen order
      renderPostList(allPostsData, postListDropdown.value);

      // Digest and alerts follow the main School choice
      syncSchoolToTabs();
    }
    catch (error) {
      console.error("Error building charts:", error);
      document.getElementById('overviewTopPosts').innerHTML = `<p class="details-message error">Could not load the dashboard data. Please try again.</p>`;
    }
  }

  // Redraw the per-post charts when "Show all posts" changes. No new reads.
  showAllPosts.addEventListener('change', () => {
    renderWeightedSentimentChart(allPostsData);
    renderSentimentStackChart(allPostsData);
    renderEngagementScoreChart(allPostsData);
    renderCommentsCountChart(allPostsData);
  });

  // Trends: one chart at a time
  const trendPicker = document.getElementById('trend-picker');
  function resizeActiveTrendChart() {
    const canvas = document.querySelector('#trendsTab .trend-view.active canvas');
    const chart = canvas && Chart.getChart(canvas);
    if (chart) chart.resize();
  }
  trendPicker.addEventListener('click', e => {
    const b = e.target.closest('button[data-trend]');
    if (!b) return;
    trendPicker.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('#trendsTab .trend-view').forEach(v => v.classList.toggle('active', v.id === b.dataset.trend));
    document.getElementById('showAllWrap').hidden = b.dataset.trend === 'timeSeriesTab';
    resizeActiveTrendChart();
  });

  // "All alerts", "Full digest" and "All posts" links on the Overview
  document.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => showTab(el.dataset.go)));

  // 10. Filters update the page as soon as they change
  periodButtons.addEventListener('click', e => {
    const b = e.target.closest('button[data-days]');
    if (!b) return;
    const days = b.dataset.days === 'custom' ? 'custom' : parseInt(b.dataset.days, 10);
    setPeriod(days);
    if (days !== 'custom') updateCharts();
  });
  [startDateInput, endDateInput].forEach(el => el.addEventListener('change', () => {
    if (startDateInput.value && endDateInput.value && startDateInput.value <= endDateInput.value) updateCharts();
  }));
  document.getElementById('tp-related-filter').addEventListener('change', updateCharts);

  // NEW: Search button listener
  searchButton.addEventListener('click', searchByKeyword);

  // NEW: Allow pressing Enter in keyword input to trigger search
  keywordInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault(); // Prevent potential form submission
      searchByKeyword();
    }
  });

  // ---------------------------------------------
  // Weekly Digest tab (documents written by digest.py)
  // ---------------------------------------------
  const digestSchool = document.getElementById('digest-school');
  const digestWeek = document.getElementById('digest-week');

  // The weeks that have a saved digest for a school, newest first. Only those
  // weeks are offered, so the tab never opens on an empty week.
  const digestWeeksBySchool = {};
  function digestWeeksFor(school) {
    if (!digestWeeksBySchool[school]) {
      const q = query(collection(db, 'weekly_digests'), where('school', '==', school));
      digestWeeksBySchool[school] = getDocs(q).then(snap => {
        const byWeek = {};
        snap.docs.forEach(d => { const data = d.data(); if (data.weekStart) byWeek[data.weekStart] = data; });
        return Object.keys(byWeek).sort().reverse().map(w => byWeek[w]);
      }).catch(err => { delete digestWeeksBySchool[school]; throw err; });
    }
    return digestWeeksBySchool[school];
  }
  digestSchool.value = 'TP';
  digestSchool.addEventListener('change', loadDigest);
  digestWeek.addEventListener('change', loadDigest);

  // The Weekly digest and Alerts tabs use the main School choice.
  function syncSchoolToTabs() {
    const school = document.getElementById('school-filter').value;
    digestSchool.value = school || 'TP';
    alertsSchool.value = school;
    const active = document.querySelector('.ui-tabs .tab-button.active');
    if (active && active.dataset.tab === 'digestTab') loadDigest();
    if (active && active.dataset.tab === 'alertsTab') loadAlerts();
  }

  async function loadDigest() {
    const container = document.getElementById('digestContent');
    container.innerHTML = '<p class="details-message loading">Loading digest...</p>';
    try {
      const digests = await digestWeeksFor(digestSchool.value);
      const chosen = digestWeek.value;
      digestWeek.innerHTML = '';
      digests.forEach(d => digestWeek.add(new Option(`Week of ${weekLabel(d.weekStart)}`, d.weekStart)));
      if (!digests.length) {
        container.innerHTML = '<p class="details-message info">There are no digests for this school yet. Digests are made every Monday morning.</p>';
        return;
      }
      const d = digests.find(x => x.weekStart === chosen) || digests[0];
      digestWeek.value = d.weekStart;
      container.innerHTML = renderDigestHtml(d);
    } catch (err) {
      console.error('Error loading digest', err);
      container.innerHTML = '<p class="details-message error">Could not load the digest.</p>';
    }
  }

  // Alerts tab
  const alertsSchool = document.getElementById('alerts-school');
  alertsSchool.value = '';
  alertsSchool.addEventListener('change', loadAlerts);

  // Alerts in the period chosen in the toolbar (whole days, Singapore time),
  // high urgency first. Kept in memory so switching tabs does not read
  // Firestore again.
  const alertsByRange = {};
  const sgMidnight = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d) - 8 * 3600 * 1000); };
  function alertsInPeriod() {
    const startIso = startDateInput.value, endIso = endDateInput.value;
    const key = `${startIso}_${endIso}`;
    if (!alertsByRange[key]) {
      const since = sgMidnight(startIso);
      const until = new Date(sgMidnight(endIso).getTime() + 86400000);
      const q = query(collection(db, 'alerts'), where('alertedAt', '>=', since), where('alertedAt', '<', until), orderBy('alertedAt', 'desc'));
      alertsByRange[key] = getDocs(q).then(snap => {
        const alerts = snap.docs.map(d => d.data());
        alerts.sort((a, b) => (a.urgency === 'high' ? 0 : 1) - (b.urgency === 'high' ? 0 : 1));
        return alerts;
      }).catch(err => { delete alertsByRange[key]; throw err; });
    }
    return alertsByRange[key];
  }

  async function loadAlerts() {
    const container = document.getElementById('alertsContent');
    try {
      if (!alertsByRange[`${startDateInput.value}_${endDateInput.value}`]) container.innerHTML = '<p class="details-message loading">Loading alerts...</p>';
      const alerts = await alertsInPeriod();
      const poly = forumPoly();
      const tp = coversTp();
      const school = tp ? alertsSchool.value : '';
      const intro = `<p class="ui-muted">Alerts for ${escapeHtml(POLY_NAMES[poly] || 'this forum')}, ${escapeHtml(periodText().charAt(0).toLowerCase() + periodText().slice(1))}.</p>`;
      container.innerHTML = intro + renderAlertsHtml(poly ? alertsFor(alerts, poly, school) : [], school, { tp });
    } catch (err) {
      console.error('Error loading alerts', err);
      container.innerHTML = '<p class="details-message error">Could not load the alerts.</p>';
    }
  }

  // 11. Initial load
  // The page always opens on "All schools", which covers the whole of TP.
  const schoolFilterSelect = document.getElementById("school-filter");
  schoolFilterSelect.value = '';
  try { localStorage.removeItem('schoolFilter'); } catch (e) { /* ignore */ }
  schoolFilterSelect.addEventListener('change', updateCharts);

  updateCharts();

  // Set default active tab on load - Handled by CSS and initial HTML structure now
  // Ensure the initially active tab button has the 'active' class in HTML
  // And the corresponding tab content also has the 'active' class in HTML

  // Reset Zoom Buttons (Listeners remain the same)




  document.getElementById('resetZoomTimeSeriesBtn').addEventListener('click', () => {
    if (timeSeriesChart) timeSeriesChart.resetZoom();
  });

  // --- Filter Visibility Logic ---
  const subredditSelect = document.getElementById("subreddit-select");
  function updateFilterVisibility() {
    // School filters: TemasekPoly and sgExams. TP-related filter: sgExams only.
    document.getElementById('school-field').hidden = !(subredditSelect.value === "TemasekPoly" || subredditSelect.value === "sgExams");
    document.getElementById('tp-related-field').hidden = subredditSelect.value !== "sgExams";
  }

  // Initial call to set visibility based on default selection
  updateFilterVisibility();

  // Update filters and charts when the subreddit selection changes
  subredditSelect.addEventListener("change", () => {
    updateFilterVisibility(); // Update visibility first
    updateCharts(); // Then update charts based on new selection and filters
  });

}); // End DOMContentLoaded
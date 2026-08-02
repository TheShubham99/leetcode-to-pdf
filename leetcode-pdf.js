/*

// Credits :
Inspired from - https://github.com/world177/Leetcode-Downloader-for-Submissions
User - https://github.com/world177
*/

LeetCodeSubmissionDownloader.LEETCODE_SUBMISSIONS_API =
  "https://leetcode.com/api/submissions";
LeetCodeSubmissionDownloader.BASE_PROBLEM_ADDRESS =
  "https://leetcode.com/problems/";

LeetCodeSubmissionDownloader.INCREASE_LAST_BY = 20;
LeetCodeSubmissionDownloader.WAIT_BETWEEN_REQUESTS = 2500; // milliseconds
LeetCodeSubmissionDownloader.INCREASE_WAIT_BY_ON_ERROR = 2;

LeetCodeSubmissionDownloader.questionMap = {};
LeetCodeSubmissionDownloader.last = 0;
LeetCodeSubmissionDownloader.processed = 0;
LeetCodeSubmissionDownloader.waitUsedBetweenRequests =
  LeetCodeSubmissionDownloader.WAIT_BETWEEN_REQUESTS;
LeetCodeSubmissionDownloader.MAX_ATTEMPT = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// Function to send a message to the popup script
function sendMessageToPopup(message) {
  chrome.runtime.sendMessage({ type: "setUpdates", ...message });
}

function fetchUsername() {
  return new Promise((resolve, reject) => {
    const query = `
      query globalData {
        userStatus {
          username
        }
      }
    `;

    const body = JSON.stringify({
      query: query,
      variables: {},
      operationName: "globalData",
    });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://leetcode.com/graphql/");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        if (data && data.data && data.data.userStatus) {
          const username = data.data.userStatus.username;
          resolve(username);
        } else {
          console.error("Failed to fetch username");
          reject("Failed to fetch username");
        }
      } else {
        console.error("Failed to fetch username");
        reject("Failed to fetch username");
      }
    };
    xhr.onerror = function () {
      console.error("Request failed");
      reject("Request failed");
    };
    xhr.send(body);
  });
}

// NEW: fetches the user's public profile + stats + contest info from LeetCode's
// GraphQL endpoint using the browser's existing logged-in session (same-origin
// XHR, same pattern as fetchUsername/fetchQuestionContent). No credentials are
// ever requested or transmitted by this extension.
function fetchUserProfile(username) {
  return new Promise((resolve, reject) => {
    const query = `
      query userProfileForReport($username: String!) {
        matchedUser(username: $username) {
          username
          profile {
            realName
            userAvatar
            ranking
            reputation
            countryName
          }
          submitStatsGlobal {
            acSubmissionNum {
              difficulty
              count
              submissions
            }
            totalSubmissionNum {
              difficulty
              count
              submissions
            }
          }
          badges {
            id
            displayName
            icon
          }
        }
        userContestRanking(username: $username) {
          attendedContestsCount
          rating
          globalRanking
          topPercentage
        }
      }
    `;

    const body = JSON.stringify({
      query: query,
      variables: { username: username },
      operationName: "userProfileForReport",
    });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://leetcode.com/graphql/");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data && data.data ? data.data : null);
        } catch (e) {
          console.error("Failed to parse profile data", e);
          reject("Failed to parse profile data");
        }
      } else {
        console.error("Failed to fetch profile data");
        reject("Failed to fetch profile data");
      }
    };
    xhr.onerror = function () {
      console.error("Request failed");
      reject("Request failed");
    };
    xhr.send(body);
  });
}

// NEW: turns the raw GraphQL response into a flat, safe-to-render object.
// Every field falls back gracefully when LeetCode doesn't have the data
// (e.g. a user who has never entered a contest, or has no badges).
function normalizeProfileData(username, rawData) {
  const fallback = {
    username: username || "",
    realName: "",
    avatar: "",
    country: "",
    ranking: null,
    reputation: null,
    totalSolved: 0,
    easySolved: 0,
    mediumSolved: 0,
    hardSolved: 0,
    acceptanceRate: null,
    contestRating: null,
    contestGlobalRank: null,
    contestTopPercentage: null,
    contestsAttended: 0,
    badges: [],
    generatedDate: new Date().toLocaleString(),
  };

  if (!rawData || !rawData.matchedUser) {
    return fallback;
  }

  const user = rawData.matchedUser;
  const profile = user.profile || {};
  const contest = rawData.userContestRanking || null;

  const acStats = (user.submitStatsGlobal &&
    user.submitStatsGlobal.acSubmissionNum) || [];
  const totalStats = (user.submitStatsGlobal &&
    user.submitStatsGlobal.totalSubmissionNum) || [];

  const findByDifficulty = (arr, difficulty) =>
    arr.find((entry) => entry.difficulty === difficulty) || null;

  const acAll = findByDifficulty(acStats, "All");
  const acEasy = findByDifficulty(acStats, "Easy");
  const acMedium = findByDifficulty(acStats, "Medium");
  const acHard = findByDifficulty(acStats, "Hard");
  const totalAll = findByDifficulty(totalStats, "All");

  let acceptanceRate = null;
  if (
    acAll &&
    totalAll &&
    typeof acAll.submissions === "number" &&
    typeof totalAll.submissions === "number" &&
    totalAll.submissions > 0
  ) {
    acceptanceRate = (acAll.submissions / totalAll.submissions) * 100;
  }

  let avatar = profile.userAvatar || "";
  if (avatar && avatar.startsWith("/")) {
    avatar = "https://leetcode.com" + avatar;
  }

  const badges = (user.badges || []).map((badge) => {
    let icon = badge.icon || "";
    if (icon && icon.startsWith("/")) {
      icon = "https://leetcode.com" + icon;
    }
    return { id: badge.id, name: badge.displayName, icon: icon };
  });

  return {
    username: user.username || username || "",
    realName: profile.realName || "",
    avatar: avatar,
    country: profile.countryName || "",
    ranking: profile.ranking != null ? profile.ranking : null,
    reputation: profile.reputation != null ? profile.reputation : null,
    totalSolved: acAll ? acAll.count : 0,
    easySolved: acEasy ? acEasy.count : 0,
    mediumSolved: acMedium ? acMedium.count : 0,
    hardSolved: acHard ? acHard.count : 0,
    acceptanceRate: acceptanceRate,
    contestRating:
      contest && contest.rating != null ? Math.round(contest.rating) : null,
    contestGlobalRank:
      contest && contest.globalRanking != null ? contest.globalRanking : null,
    contestTopPercentage:
      contest && contest.topPercentage != null
        ? contest.topPercentage
        : null,
    contestsAttended: contest ? contest.attendedContestsCount || 0 : 0,
    badges: badges,
    generatedDate: new Date().toLocaleString(),
  };
}

function fetchQuestionContent(titleSlug) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const query = `
        query questionContent($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            content
          }
        }
      `;

      const variables = {
        titleSlug: titleSlug,
      };

      const body = JSON.stringify({
        query: query,
        variables: variables,
        operationName: "questionContent",
      });

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "https://leetcode.com/graphql/");
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          resolve(data.data.question.content);
        } else {
          console.error("Failed to fetch question content");
          reject("Failed to fetch question content");
        }
      };
      xhr.onerror = function () {
        console.error("Request failed");
        reject("Request failed");
      };
      xhr.send(body);
    }, 50); // 50 milliseconds delay to avoid rate limitting
  });
}

function highlightCode(language, code) {
  let highlightedCode = "";
  const lines = code.split("\n");

  switch (language) {
    case "python":
    case "python3":
      for (const line of lines) {
        const isComment = line.trim().startsWith("#");
        if (isComment) {
          highlightedCode += `<span class='comment'>${line}</span>\n`;
        } else {
          let highlightedLine = line.replace(
            /\b(if|else|elif|while|for|in|def|class|pass|return)\b/g,
            "<span class='keyword'>$1</span>"
          );
          highlightedCode += `${highlightedLine}\n`;
        }
      }
      break;
    case "cpp":
      for (const line of lines) {
        // Define patterns to highlight C++ keywords and comments
        const isComment =
          line.trim().startsWith("//") ||
          line.trim().startsWith("/*") ||
          line.trim().endsWith("*/");

        if (isComment) {
          highlightedCode += `<span class='comment'>${line}</span>\n`;
        } else {
          let highlightedLine = line.replace(
            /\b(if|else|while|for|return|break|continue|class|int|double|string|void|float|long|bool|vector|string|char|map|set)\b/g,
            "<span class='keyword'>$1</span>"
          );
          highlightedCode += `${highlightedLine}\n`;
        }
      }
      break;
    default:
      // If language is not recognized, simply return the original code
      highlightedCode = code;
      break;
  }

  return highlightedCode;
}

// NEW: small helper to keep the template below readable.
function escapeHTML(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// NEW: builds the stat-card markup for the dashboard cover page.
function buildStatCardHTML(label, value, sub) {
  return `
    <div class="stat-card">
      <div class="stat-value">${escapeHTML(value)}</div>
      <div class="stat-label">${escapeHTML(label)}</div>
      ${sub ? `<div class="stat-sub">${escapeHTML(sub)}</div>` : ""}
    </div>
  `;
}

// NEW: builds the professional cover / dashboard page shown before the
// problem-by-problem breakdown. Dark theme, gradient header, stat cards,
// a difficulty donut chart (Chart.js), progress bars and badges.
function buildCoverPageHTML(profile, totalProblemsInReport) {
  const hasRealName = !!profile.realName;
  const hasCountry = !!profile.country;
  const hasAcceptance = profile.acceptanceRate != null;
  const hasContest = profile.contestRating != null;

  const rankingDisplay =
    profile.ranking != null ? "#" + profile.ranking.toLocaleString() : "N/A";
  const reputationDisplay =
    profile.reputation != null ? profile.reputation.toLocaleString() : "N/A";
  const acceptanceDisplay = hasAcceptance
    ? profile.acceptanceRate.toFixed(1) + "%"
    : "N/A";
  const contestRatingDisplay = hasContest
    ? Math.round(profile.contestRating).toLocaleString()
    : "Unrated";
  const contestRankDisplay =
    profile.contestGlobalRank != null
      ? "#" + profile.contestGlobalRank.toLocaleString()
      : "N/A";

  const totalSolved = profile.totalSolved || 0;
  const easy = profile.easySolved || 0;
  const medium = profile.mediumSolved || 0;
  const hard = profile.hardSolved || 0;
  const maxDifficulty = Math.max(easy, medium, hard, 1);

  const avatarHTML = profile.avatar
    ? `<img class="avatar" src="${escapeHTML(
        profile.avatar
      )}" alt="avatar" />`
    : `<div class="avatar avatar-fallback">${escapeHTML(
        (profile.username || "?").charAt(0).toUpperCase()
      )}</div>`;

  const badgesHTML =
    profile.badges && profile.badges.length
      ? `
        <div class="badges-row">
          ${profile.badges
            .slice(0, 8)
            .map(
              (b) => `
              <div class="badge-chip" title="${escapeHTML(b.name)}">
                ${
                  b.icon
                    ? `<img src="${escapeHTML(b.icon)}" alt="${escapeHTML(
                        b.name
                      )}" />`
                    : "🏅"
                }
                <span>${escapeHTML(b.name)}</span>
              </div>
            `
            )
            .join("")}
        </div>
      `
      : `<div class="badges-empty">No badges earned yet</div>`;

  return `
    <section class="cover-page">
      <div class="term-bar">
        <span class="dot dot-red"></span>
        <span class="dot dot-yellow"></span>
        <span class="dot dot-green"></span>
        <span class="term-path">~/leetcode --generate-report --user=${escapeHTML(
          profile.username || "anonymous"
        )}</span>
      </div>

      <header class="cover-header">
        ${avatarHTML}
        <div class="identity">
          <h1 class="handle">@${escapeHTML(profile.username || "unknown")}</h1>
          ${hasRealName ? `<div class="realname">${escapeHTML(
            profile.realName
          )}</div>` : ""}
          <div class="meta-row">
            ${hasCountry ? `<span class="meta-pill">📍 ${escapeHTML(
              profile.country
            )}</span>` : ""}
            <span class="meta-pill">Ranking ${escapeHTML(
              rankingDisplay
            )}</span>
            <span class="meta-pill">Reputation ${escapeHTML(
              reputationDisplay
            )}</span>
          </div>
        </div>
      </header>

      <div class="stat-grid">
        ${buildStatCardHTML("Total Solved", totalSolved)}
        ${buildStatCardHTML("Acceptance Rate", acceptanceDisplay)}
        ${buildStatCardHTML("Contest Rating", contestRatingDisplay)}
        ${buildStatCardHTML(
          "Contest Global Rank",
          contestRankDisplay,
          profile.contestsAttended
            ? profile.contestsAttended + " contests attended"
            : "No contests yet"
        )}
      </div>

      <div class="panel-grid">
        <div class="panel">
          <h2 class="panel-title">Difficulty Breakdown</h2>
          <div class="chart-wrap">
            <canvas id="difficultyChart" width="220" height="220"></canvas>
          </div>
          <div class="progress-list">
            <div class="progress-row">
              <span class="progress-label difficulty-easy">Easy</span>
              <div class="progress-track">
                <div class="progress-fill fill-easy" style="width:${
                  (easy / maxDifficulty) * 100
                }%;"></div>
              </div>
              <span class="progress-count">${easy}</span>
            </div>
            <div class="progress-row">
              <span class="progress-label difficulty-medium">Medium</span>
              <div class="progress-track">
                <div class="progress-fill fill-medium" style="width:${
                  (medium / maxDifficulty) * 100
                }%;"></div>
              </div>
              <span class="progress-count">${medium}</span>
            </div>
            <div class="progress-row">
              <span class="progress-label difficulty-hard">Hard</span>
              <div class="progress-track">
                <div class="progress-fill fill-hard" style="width:${
                  (hard / maxDifficulty) * 100
                }%;"></div>
              </div>
              <span class="progress-count">${hard}</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <h2 class="panel-title">Badges</h2>
          ${badgesHTML}
          <h2 class="panel-title panel-title-spaced">This Report</h2>
          <div class="report-summary">
            <div><span class="dim">Problems included:</span> ${totalProblemsInReport}</div>
            <div><span class="dim">Generated:</span> ${escapeHTML(
              profile.generatedDate
            )}</div>
          </div>
        </div>
      </div>

      <footer class="cover-footer">
        <span>Generated by LeetBook &middot; ${escapeHTML(
          profile.generatedDate
        )}</span>
        <span class="page-num"></span>
      </footer>
    </section>

    <script>
      (function () {
        function initChart() {
          var ctx = document.getElementById("difficultyChart");
          if (!ctx || typeof Chart === "undefined") return;
          new Chart(ctx, {
            type: "doughnut",
            data: {
              labels: ["Easy", "Medium", "Hard"],
              datasets: [
                {
                  data: [${easy}, ${medium}, ${hard}],
                  backgroundColor: ["#00b8a3", "#ffc01e", "#ff375f"],
                  borderColor: "#12161f",
                  borderWidth: 3,
                },
              ],
            },
            options: {
              responsive: false,
              plugins: {
                legend: { display: false },
              },
              cutout: "68%",
            },
          });
        }
        if (document.readyState === "complete") {
          initChart();
        } else {
          window.addEventListener("load", initChart);
        }
      })();
    </script>
  `;
}

function generateHTMLContent(username = "", profileData = null) {
  const profile = normalizeProfileData(username, profileData);
  const problemEntries = Object.entries(
    LeetCodeSubmissionDownloader.questionMap
  );

  let htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>LeetCode Submissions</title>
            <link rel="icon" type="image/x-icon" href="https://raw.githubusercontent.com/TheShubham99/leetcode-to-pdf/main/logo.png">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js"><\/script>
            <style>
                * {
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    background-color: #f0f0f0;
                    color: #333;
                    padding: 20px;
                    print-color-adjust: exact;
                    -webkit-print-color-adjust: exact;
                    margin: 0;
                }
                .header {
                    background-color: #f8f9fa;
                    padding: 20px;
                    text-align: center;
                    margin-bottom: 20px;
                }
                .header h1 {
                    color: #007bff;
                    margin: 0;
                }
                .header-buttons {
                    margin-top: 10px;
                }
                .button {
                    background-color: #007bff;
                    color: #fff;
                    border: none;
                    padding: 10px 20px;
                    font-size: 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    text-decoration: none;
                    display: inline-block;
                    margin-right: 10px;
                    transition: background-color 0.3s ease;
                }
                .button:hover {
                    background-color: #0056b3;
                }
                .question {
                    margin-bottom: 40px;
                    border: 1px solid #ccc;
                    padding: 20px;
                    background-color: #fff;
                }
                .title {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: #333;
                }
                .language {
                    font-style: italic;
                    color: #666;
                    margin-bottom: 10px;
                }
                .description {
                    margin-bottom: 20px;
                }
                .solution {
                    margin-top: 20px;
                }
                .solution-status {
                    color: green;
                    font-weight: bold;
                    margin-bottom: 10px;
                }
                pre {
                    padding: 2rem;
                    border: 1px grey solid;
                    padding: 10px;
                    border-radius: 4px;
                    overflow-x: auto;
                }
                .keyword{
                    color: #0e77ae;
                }
                .comment{
                    color: green;
                }

                /* ===== Dashboard cover page (dark theme) ===== */
                :root {
                    --lb-bg: #0a0e14;
                    --lb-surface: #12161f;
                    --lb-surface-alt: #1b2230;
                    --lb-text: #e6edf3;
                    --lb-dim: #7d8590;
                    --lb-accent: #ffa116;
                    --lb-accent-2: #ff6b35;
                    --lb-easy: #00b8a3;
                    --lb-medium: #ffc01e;
                    --lb-hard: #ff375f;
                }
                .cover-page {
                    background: var(--lb-bg);
                    color: var(--lb-text);
                    border-radius: 14px;
                    padding: 0 0 24px 0;
                    margin-bottom: 20px;
                    page-break-after: always;
                    font-family: 'Segoe UI', Arial, sans-serif;
                    overflow: hidden;
                }
                .term-bar {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: #0d1117;
                    padding: 12px 20px;
                    border-bottom: 1px solid #232a36;
                }
                .dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
                .dot-red { background: #ff5f56; }
                .dot-yellow { background: #ffbd2e; }
                .dot-green { background: #27c93f; }
                .term-path {
                    margin-left: 10px;
                    font-family: 'Consolas', 'Courier New', monospace;
                    font-size: 13px;
                    color: #7d8590;
                }
                .cover-header {
                    display: flex;
                    align-items: center;
                    gap: 24px;
                    padding: 32px 32px 8px 32px;
                    background: linear-gradient(135deg, rgba(255,161,22,0.16), rgba(255,107,53,0.02) 60%);
                }
                .avatar {
                    width: 96px;
                    height: 96px;
                    border-radius: 20px;
                    object-fit: cover;
                    border: 2px solid var(--lb-accent);
                }
                .avatar-fallback {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 40px;
                    font-weight: bold;
                    background: var(--lb-surface-alt);
                    color: var(--lb-accent);
                }
                .identity .handle {
                    margin: 0;
                    font-size: 30px;
                    font-family: 'Consolas', 'Courier New', monospace;
                    background: linear-gradient(90deg, var(--lb-accent), var(--lb-accent-2));
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                }
                .identity .realname {
                    color: var(--lb-dim);
                    font-size: 15px;
                    margin-top: 2px;
                }
                .meta-row {
                    margin-top: 10px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .meta-pill {
                    background: var(--lb-surface-alt);
                    border: 1px solid #232a36;
                    border-radius: 999px;
                    padding: 4px 12px;
                    font-size: 12px;
                    color: var(--lb-text);
                }
                .stat-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 14px;
                    padding: 24px 32px 8px 32px;
                }
                .stat-card {
                    background: var(--lb-surface);
                    border: 1px solid #232a36;
                    border-radius: 12px;
                    padding: 16px;
                    text-align: center;
                }
                .stat-value {
                    font-size: 26px;
                    font-weight: 700;
                    font-family: 'Consolas', 'Courier New', monospace;
                    color: var(--lb-accent);
                }
                .stat-label {
                    margin-top: 4px;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: var(--lb-dim);
                }
                .stat-sub {
                    margin-top: 6px;
                    font-size: 11px;
                    color: var(--lb-dim);
                }
                .panel-grid {
                    display: grid;
                    grid-template-columns: 1.1fr 0.9fr;
                    gap: 14px;
                    padding: 16px 32px;
                }
                .panel {
                    background: var(--lb-surface);
                    border: 1px solid #232a36;
                    border-radius: 12px;
                    padding: 18px;
                }
                .panel-title {
                    font-size: 14px;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: var(--lb-dim);
                    margin: 0 0 12px 0;
                }
                .panel-title-spaced { margin-top: 18px; }
                .chart-wrap {
                    display: flex;
                    justify-content: center;
                    margin-bottom: 14px;
                }
                .progress-list {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .progress-row {
                    display: grid;
                    grid-template-columns: 70px 1fr 34px;
                    align-items: center;
                    gap: 10px;
                    font-size: 12px;
                }
                .progress-label.difficulty-easy { color: var(--lb-easy); }
                .progress-label.difficulty-medium { color: var(--lb-medium); }
                .progress-label.difficulty-hard { color: var(--lb-hard); }
                .progress-track {
                    background: #0d1117;
                    border-radius: 999px;
                    height: 8px;
                    overflow: hidden;
                }
                .progress-fill { height: 100%; border-radius: 999px; }
                .fill-easy { background: var(--lb-easy); }
                .fill-medium { background: var(--lb-medium); }
                .fill-hard { background: var(--lb-hard); }
                .progress-count { text-align: right; color: var(--lb-dim); }
                .badges-row {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .badge-chip {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: var(--lb-surface-alt);
                    border: 1px solid #232a36;
                    border-radius: 999px;
                    padding: 4px 10px;
                    font-size: 11px;
                }
                .badge-chip img { width: 16px; height: 16px; border-radius: 4px; }
                .badges-empty {
                    color: var(--lb-dim);
                    font-size: 12px;
                }
                .report-summary {
                    font-size: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    color: var(--lb-text);
                }
                .report-summary .dim { color: var(--lb-dim); }
                .cover-footer {
                    display: flex;
                    justify-content: space-between;
                    padding: 16px 32px 0 32px;
                    font-size: 11px;
                    color: var(--lb-dim);
                    border-top: 1px solid #232a36;
                    margin-top: 8px;
                }
                @media (max-width: 700px) {
                    .stat-grid { grid-template-columns: repeat(2, 1fr); }
                    .panel-grid { grid-template-columns: 1fr; }
                }
                @media print {
                    body { background: #fff; padding: 0; }
                    .cover-page { border-radius: 0; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>My LeetCode Submissions ${
                  username ? `- @${username}` : ""
                }</h1>
                <div class="header-buttons">
                    <a class="button" onclick="print()" >Download PDF </a>
                    <a href="https://github.com/theshubham99" class="button" target="_blank">Follow @TheShubham99 on GitHub</a>
                    <a href="https://github.com/theshubham99/leetcode-submissions" class="button" target="_blank">Star on GitHub</a>
                    <a href="https://github.com/theshubham99/leetcode-to-pdf" class="button" target="_blank">View Source Code</a>
                </div>
            </div>

            <div class="question" style="text-align: center; background-color: #f8f9fa; border: 2px dashed #ccc; padding: 30px; margin-top: 20px; page-break-inside: avoid;">
                <div style="font-size:4em; margin-bottom: 15px;">🥺</div>
                <h2 style="margin-top: 0; color: #111;">Your PDF is Ready! ❤️ </h2>
                <p style="font-size: 16px; color: #333; margin-bottom: 20px;">If LeetBook saved you some time, it would mean the absolute world to us if you could drop a quick 5-star rating! 🙏🏻</p>
                <a href="https://chromewebstore.google.com/detail/emdfjmejkmhehmpaggklnmhgloijgnam/reviews" target="_blank" style="display: inline-block; background-color: #fbbc04; color: #111; font-weight: bold; font-size: 18px; padding: 12px 24px; text-decoration: none; border-radius: 6px;">⭐ Rate 5 Stars on Chrome</a>
                <div style="margin-top: 20px;">
                    <a href="https://github.com/TheShubham99/leetcode-to-pdf" target="_blank" style="color: #888; font-size: 14px; text-decoration: underline;">Or drop a star on GitHub 🌟</a>
                </div>
            </div>

            ${buildCoverPageHTML(profile, problemEntries.length)}
    `;

  // Iterate over each question in the questionMap and add it to the HTML content
  for (const [
    title,
    { heading, language, description, solution },
  ] of problemEntries) {
    let highlightedSolution = highlightCode(
      language,
      solution
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
    );

    htmlContent += `
            <div class="question">
                <div class="title">
                    <a href="https://leetcode.com/problems/${title}/description" target="_blank" style="color:'black'"><b>${heading}</b> (link)</a>
                </div>
                <div class="description">
                    <h2>Description</h2>
                    ${description}
                </div>
                <div style="font-size:12px;">(scroll down for solution)</div>
                </br>
                <div class="solution" style="page-break-before: always;  page-break-after: always;">
                    <h2>Solution</h2>
                     <div class="language">Language: ${language}</div>
                    <div class="solution-status">Status: Accepted</div>
                    <pre><code>${highlightedSolution}</code></pre>
                </div>
            </div>
        `;
  }

  htmlContent += `
        </body>
        </html>
    `;

  return htmlContent;
}

// Function to open print dialog for specific HTML content
function printHTML(htmlContent) {
  sendMessageToPopup({
    button: `Download PDF <span style="font-size: 16px; margin-left: 2px;">&#10507;</span>`,
    processing: false,
  });
  // Open the HTML content in a new window
  const newWindow = window.open();
  newWindow.document.write(htmlContent);
  // Close the document to complete the loading process
  newWindow.document.close();
}

LeetCodeSubmissionDownloader.pullFromLeetCodeAPI = function () {
  if (LeetCodeSubmissionDownloader.MAX_ATTEMPT <= 0) {
    sendMessageToPopup({
      process_status: "Error: Something Went Wrong",
      button: "Please wait...",
      processing: false,
    });
    return;
  }
  try {
    let address = new URL(
      LeetCodeSubmissionDownloader.LEETCODE_SUBMISSIONS_API +
        "?offset=" +
        LeetCodeSubmissionDownloader.last +
        "&limit=" +
        LeetCodeSubmissionDownloader.INCREASE_LAST_BY
    );

    let xmlHttp = new XMLHttpRequest();

    xmlHttp.onreadystatechange = function () {
      if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
        LeetCodeSubmissionDownloader.processAPIResults(xmlHttp.responseText);
      } else if (xmlHttp.readyState == 4) {
        LeetCodeSubmissionDownloader.handleError();
      }
    };

    xmlHttp.addEventListener("error", function () {
      LeetCodeSubmissionDownloader.handleError();
    });

    xmlHttp.open("GET", address, true);
    xmlHttp.send(null);
  } catch (e) {
    LeetCodeSubmissionDownloader.handleError();
  }
};

LeetCodeSubmissionDownloader.handleError = async function () {
  LeetCodeSubmissionDownloader.waitUsedBetweenRequests *=
    LeetCodeSubmissionDownloader.INCREASE_WAIT_BY_ON_ERROR;

  sendMessageToPopup({
    process_status: "Error: Failed to pull API data",
    processing: true,
  });
  console.log(
    "Error: Failed to pull API data from " +
      LeetCodeSubmissionDownloader.LEETCODE_SUBMISSIONS_API +
      ". Doubling the wait time between requests to " +
      LeetCodeSubmissionDownloader.waitUsedBetweenRequests +
      " milliseconds."
  );

  LeetCodeSubmissionDownloader.MAX_ATTEMPT -= 1;
  await sleep(LeetCodeSubmissionDownloader.waitUsedBetweenRequests);

  LeetCodeSubmissionDownloader.pullFromLeetCodeAPI();
};

// example question in questionMap
// const question = {
//     title: title,
//     heading:titleHeading,
//     language: submissionsFound[i].lang,
//     description: questionContent,
//     solution: String(submissionsFound[i].code),
//     question_id: submissionsFound[i].question_id,
// };

LeetCodeSubmissionDownloader.processAPIResults = async function (
  lastWebResult
) {
  let data = JSON.parse(lastWebResult);

  let submissionsFound = data.submissions_dump;

  LeetCodeSubmissionDownloader.last += submissionsFound.length;
  LeetCodeSubmissionDownloader.processed += 0;

  for (let i = 0; i < submissionsFound.length; i++) {
    const title = submissionsFound[i].title_slug;
    const titleHeading =
      submissionsFound[i].question_id + " " + submissionsFound[i].title;

    if (
      title in LeetCodeSubmissionDownloader.questionMap ||
      submissionsFound[i]?.status_display?.toLowerCase() !== "accepted"
    ) {
      // if question is already in map
      // or
      // status is not accepted then continue
      continue;
    }

    LeetCodeSubmissionDownloader.processed += 1;

    await fetchQuestionContent(title)
      .then((questionContent) => {
        // Log question content
        const question = {
          title: title,
          heading: titleHeading,
          language: submissionsFound[i].lang,
          description: questionContent,
          solution: String(submissionsFound[i].code),
          question_id: submissionsFound[i].question_id,
        };

        LeetCodeSubmissionDownloader.questionMap[title] = question;
      })
      .catch((error) => {
        console.error("Failed to fetch question content:", error);
      });
  }

  if (!data.has_next) {
    sendMessageToPopup({
      process_status:
        `<span style="color:green;"> Total submissions processed:  ` +
        LeetCodeSubmissionDownloader.processed +
        "</span>",
      processing: false,
    });
    console.log(
      "Total Questions processed:  " + LeetCodeSubmissionDownloader.processed
    );

    fetchUsername()
      .then(async (username) => {
        const profileData = await fetchUserProfile(username).catch((err) => {
          console.error("Failed to fetch profile data:", err);
          return null;
        });

        const htmlContent = generateHTMLContent(username, profileData);
        printHTML(htmlContent);
      })
      .catch(() => {
        const htmlContent = generateHTMLContent("", null);
        printHTML(htmlContent);
      });
  } else {
    // Send messages to the popup script
    sendMessageToPopup({ button: "Loading...", processing: true });
    sendMessageToPopup({
      process_status:
        `
    <div class="ui active progress indeterminate" style="margin:7px 0 10px;">
      <div class="bar" style="width:60%; height:10px; border-radius:8px; background-color:purple;"></div>
    </div>
    Please wait..
    <div> Questions saved so far: <span style="color:green">` +
        LeetCodeSubmissionDownloader.processed +
        `</span></div>`,
      processing: true,
    });
    console.log(
      "Questions saved so far:  " + LeetCodeSubmissionDownloader.processed
    );
    console.log("Batch Complete! Hold on, next batch in progress.");

    await sleep(LeetCodeSubmissionDownloader.waitUsedBetweenRequests);

    LeetCodeSubmissionDownloader.pullFromLeetCodeAPI();
  }
};

function LeetCodeSubmissionDownloader() {
  return this;
}

LeetCodeSubmissionDownloader.pullFromLeetCodeAPI();

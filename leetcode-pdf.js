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

function generateHTMLContent(username = "") {
  let htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>LeetCode Submissions</title>
            <link rel="icon" type="image/x-icon" href="https://raw.githubusercontent.com/TheShubham99/leetcode-to-pdf/main/logo.png">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #f0f0f0;
                    color: #333;
                    padding: 20px;
                    print-color-adjust: exact; 
                }
                .header {
                    background-color: #f8f9fa;
                    padding: 20px;
                    text-align: center;
                    margin-bottom: 20px;
                    height:
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
    `;

  // Iterate over each question in the questionMap and add it to the HTML content
  for (const [
    title,
    { heading, language, description, solution },
  ] of Object.entries(LeetCodeSubmissionDownloader.questionMap)) {
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
      .then((username) => {
        const htmlContent = generateHTMLContent(username);
        printHTML(htmlContent);
      })
      .catch((error) => {
        console.error("Failed to get username Error:", error);
        const htmlContent = generateHTMLContent("");
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

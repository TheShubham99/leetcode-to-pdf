let button;
let processStatus;
let wasProcessing = false;

async function getUpdates(button, processStatus) {
  await chrome.runtime.sendMessage({ type: "getUpdates" }, (response) => {
    const stuckWarning = document.getElementById("stuck-warning");

    if (response && response.processing) {
      wasProcessing = true;
      if (response.startTime && (Date.now() - response.startTime > 10000)) {
        if (stuckWarning) stuckWarning.style.display = "block";
      } else {
        if (stuckWarning) stuckWarning.style.display = "none";
      }
    }

    if (response && !response.processing) {
      if (stuckWarning) stuckWarning.style.display = "none";
      
      if (wasProcessing) {
        wasProcessing = false;
        if (window.intInterval) {
            clearInterval(window.intInterval);
            window.intInterval = null;
        }
      }
      button.innerHTML = `Download PDF <span style="font-size: 16px; margin-left: 2px;">&#10507;</span>`;
      processStatus.innerHTML = "";
      button.disabled = false;
      return;
    }
    
    if (response?.process_status) {
      processStatus.innerHTML = response.process_status;
    }
    if (response?.button) {
      button.innerHTML = response.button;
      if (String(response?.button)?.toLowerCase()?.includes("loading")) {
        button.disabled = true;
      } else {
        button.disabled = false;
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  button = document.getElementById("download-submissions");
  processStatus = document.getElementById("process-status");

  const restartBtn = document.getElementById("restart-btn");
  const stuckWarning = document.getElementById("stuck-warning");
  if (restartBtn) {
    restartBtn.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: "setUpdates", processing: false, process_status: "" }, () => {
        if (stuckWarning) stuckWarning.style.display = "none";
        button.innerHTML = `Download PDF <span style="font-size: 16px; margin-left: 2px;">&#10507;</span>`;
        processStatus.innerHTML = "";
        button.disabled = false;
        wasProcessing = false;
        if (window.intInterval) {
            clearInterval(window.intInterval);
            window.intInterval = null;
        }
      });
    });
  }

  await getUpdates(button, processStatus);

  if (button) {
    button.addEventListener("click", async () => {
      // Tell background we are officially processing to prevent immediate false-positive completion
      chrome.runtime.sendMessage({ type: "setUpdates", processing: true, process_status: "Starting...", button: "Loading..." });

      if (!window.intInterval) {
        window.intInterval = setInterval(async () => {
          await getUpdates(button, processStatus);
        }, 4000);
      }
      processStatus.innerText = "Please wait...";
      button.innerHTML = "Loading...";
      button.disabled = true;
      wasProcessing = true;

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      originalContent = `Download PDF <span style="font-size: 16px; margin-left: 2px;">&#10507;</span>`;
      button.disabled = true;
      button.innerHTML = "Loading...";

      if (tab?.url?.includes?.("leetcode.com")) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["leetcode-pdf.js"],
        });
      } else {
        button.disabled = false;
        button.innerHTML = originalContent;
        processStatus.innerHTML = "This extension works only on leetcode.com";
        alert("This extension works only on leetcode.com");
        wasProcessing = false;
        if (window.intInterval) {
            clearInterval(window.intInterval);
            window.intInterval = null;
        }
      }
      return window.intInterval;
    });
  }
});

let button;
let processStatus;

async function getUpdates(button, processStatus) {
  await chrome.runtime.sendMessage({ type: "getUpdates" }, (response) => {
    if (!response.processing) {
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

  await getUpdates(button, processStatus);

  if (button) {
    button.addEventListener("click", async () => {
      const int = setInterval(async () => {
        await getUpdates(button, processStatus);
      }, 4000);
      processStatus.innerText = "Please wait...";
      button.innerHTML = "Loading...";
      button.disabled = true;
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      button.disabled = true;
      originalContent = button.innerHTML;
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
      }
      return int;
    });
  }
});

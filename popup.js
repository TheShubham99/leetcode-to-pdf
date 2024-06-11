document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("download-submissions");
  if (button) {
    button.addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      button.disabled = true;
      originalContent = button.innerHTML;
      button.textContent = "Loading...";
      button.classList.add("disable");

      if (tab.url.includes("leetcode.com")) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["leetcode-pdf.js"],
        });
      } else {
        button.disabled = false;
        button.innerHTML = originalContent;

        alert("This extension works only on leetcode.com");
      }
    });
  }
});

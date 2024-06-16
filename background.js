let process_status = "";
let button = `Download PDF <span style="font-size: 16px; margin-left: 2px;">&#10507;</span>`;
let processing = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getUpdates") {
    if (!processing) {
      process_status = "";
      button = `Download PDF <span style="font-size: 16px; margin-left: 2px;">&#10507;</span>`;
    }
    // Process the message and prepare the data to send back
    const responseData = { button, process_status, processing };

    // Send the response back to the content script or popup script
    sendResponse(responseData);
  }

  if (message.type === "setUpdates") {
    if (message.button) {
      button = message.button;
    }

    if (message.process_status) {
      process_status = message.process_status;
    }

    if (message.processing == false) {
      processing = false;
    } else {
      processing = true;
    }
  }
});

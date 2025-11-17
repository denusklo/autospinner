// TOS Auto Spinner - Popup Script

function updateStatus(message) {
  document.getElementById('status').textContent = message;
}

function sendMessageToContent(action) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs.length === 0) {
      updateStatus('Error: No active tab');
      return;
    }

    const tab = tabs[0];

    // Check if we're on the right page
    if (!tab.url || !tab.url.includes('louisalflame.github.io')) {
      updateStatus('Error: Please navigate to the TOS simulator');
      return;
    }

    chrome.tabs.sendMessage(tab.id, {action: action}, (response) => {
      if (chrome.runtime.lastError) {
        updateStatus(`Error: ${chrome.runtime.lastError.message}`);
        console.error(chrome.runtime.lastError);
      } else if (response && response.success) {
        updateStatus(`${action} successful`);
      } else {
        updateStatus(`Failed to ${action}`);
      }
    });
  });
}

// Event listeners
document.getElementById('inspectBtn').addEventListener('click', () => {
  updateStatus('Inspecting page...');
  sendMessageToContent('inspect');
});

document.getElementById('startBtn').addEventListener('click', () => {
  updateStatus('Starting...');
  sendMessageToContent('start');
});

document.getElementById('stopBtn').addEventListener('click', () => {
  updateStatus('Stopping...');
  sendMessageToContent('stop');
});

// Initial status
updateStatus('Ready - Open TOS simulator');

// Flowork Sentinel - Popup Controller
document.addEventListener('DOMContentLoaded', async () => {
  const btnRecord = document.getElementById('btn-record');
  const btnText = document.getElementById('btn-text');
  const inputName = document.getElementById('session-name');
  const telemetryBox = document.getElementById('telemetry-box');
  const actionCounter = document.getElementById('action-count');

  // Check initial state
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
    if (res && res.isRecording) {
      setRecordingUI(true, res.currentSession?.name);
    } else {
      setRecordingUI(false);
    }
  });

  // Get current active tab URL as default name
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].url) {
      try {
        const u = new URL(tabs[0].url);
        if (u.hostname.includes('suno')) {
          inputName.value = 'suno_music_session';
        } else if (u.hostname.includes('facebook')) {
          inputName.value = 'facebook_post_session';
        } else {
          inputName.value = `${u.hostname.replace(/[^a-zA-Z0-9]/g, '_')}_session`;
        }
      } catch (_) {}
    }
  });

  btnRecord.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, async (status) => {
      if (status && status.isRecording) {
        // Stop recording
        btnRecord.disabled = true;
        btnText.textContent = 'SAVING & SYNTHESIZING...';
        chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, (res) => {
          btnRecord.disabled = false;
          setRecordingUI(false);
          alert('Session recording finished! Open Sentinel Studio to synthesize into SKILL.md.');
        });
      } else {
        // Start recording
        btnRecord.disabled = true;
        btnText.textContent = 'CONNECTING...';
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const currentUrl = tabs[0]?.url || '';
          chrome.runtime.sendMessage({
            type: 'START_RECORDING',
            sessionName: inputName.value.trim() || 'unnamed_session',
            targetUrl: currentUrl
          }, (res) => {
            btnRecord.disabled = false;
            if (res && res.status === 'ok') {
              setRecordingUI(true, inputName.value.trim());
            } else {
              alert(res?.message || 'Failed to start recording session. Make sure Flowork Sentinel engine is running on port 17870.');
              setRecordingUI(false);
            }
          });
        });
      }
    });
  });

  function setRecordingUI(recording, name) {
    if (recording) {
      btnRecord.classList.add('recording');
      btnText.textContent = 'STOP & SYNTHESIZE';
      telemetryBox.style.display = 'flex';
      inputName.disabled = true;
      if (name) inputName.value = name;
    } else {
      btnRecord.classList.remove('recording');
      btnText.textContent = 'START RECORDING';
      telemetryBox.style.display = 'none';
      inputName.disabled = false;
    }
  }
});

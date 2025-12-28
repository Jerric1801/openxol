class SetupUI {
  constructor() {
    this.setupComplete = false;
    this.setupInProgress = false;
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById('startSetupBtn').addEventListener('click', () => {
      this.startSetup();
    });

    document.getElementById('continueBtn').addEventListener('click', () => {
      // Notify main process to reload to main app
      if (window.electronAPI.notifySetupFinished) {
        window.electronAPI.notifySetupFinished();
      } else {
        // Fallback: manual navigation
        window.location.href = 'index.html';
      }
    });
  }

  updateStepStatus(step, status, progress = 0, message = '') {
    const icon = document.getElementById(`${step}Icon`);
    const statusText = document.getElementById(`${step}Status`);
    const progressBar = document.getElementById(`${step}Progress`);
    const progressFill = document.getElementById(`${step}ProgressFill`);
    const messageEl = document.getElementById(`${step}Message`);

    // Update icon
    icon.className = `status-icon ${status}`;

    // Update status text
    const statusMessages = {
      pending: 'Waiting...',
      downloading: 'Downloading...',
      success: 'Ready',
      error: 'Failed'
    };
    statusText.textContent = statusMessages[status] || status;

    // Update progress
    if (status === 'downloading') {
      progressBar.style.display = 'block';
      progressFill.style.width = `${progress}%`;
    } else {
      progressBar.style.display = 'none';
    }

    // Update message
    if (message) {
      messageEl.textContent = message;
    }
  }

  async startSetup() {
    if (this.setupInProgress) return;

    this.setupInProgress = true;
    document.getElementById('startSetupBtn').disabled = true;
    document.getElementById('errorContainer').innerHTML = '';

    try {
      // Listen for progress updates
      window.electronAPI.onProgress((event, data) => {
        this.handleProgressUpdate(data);
      });

      // Start setup
      const result = await window.electronAPI.performSetup();

      if (result.errors && result.errors.length > 0) {
        this.showErrors(result.errors);
        // Still allow continuing if some components succeeded
        if (result.binaries.whisper && result.binaries.ffmpeg && result.models['base.en']) {
          this.setupComplete = true;
          document.getElementById('successContainer').style.display = 'block';
          document.getElementById('continueBtn').style.display = 'inline-block';
        }
      } else {
        this.setupComplete = true;
        this.updateStepStatus('whisper', 'success', 100);
        this.updateStepStatus('ffmpeg', 'success', 100);
        this.updateStepStatus('model', 'success', 100);
        document.getElementById('successContainer').style.display = 'block';
        document.getElementById('continueBtn').style.display = 'inline-block';
        document.getElementById('startSetupBtn').style.display = 'none';
        
        // Notify main process that setup is complete
        // This will trigger automatic reload to main app
        if (window.electronAPI.notifySetupFinished) {
          window.electronAPI.notifySetupFinished();
        }
      }
    } catch (error) {
      this.showError(error.message);
    } finally {
      this.setupInProgress = false;
      if (!this.setupComplete) {
        document.getElementById('startSetupBtn').disabled = false;
      }
    }
  }

  handleProgressUpdate(data) {
    if (data.step === 'whisper') {
      this.updateStepStatus('whisper', 'downloading', data.progress || 0, data.message);
    } else if (data.step === 'ffmpeg') {
      this.updateStepStatus('ffmpeg', 'downloading', data.progress || 0, data.message);
    } else if (data.step === 'model') {
      this.updateStepStatus('model', 'downloading', data.progress || 0, data.message);
    } else if (data.step === 'complete') {
      this.updateStepStatus('whisper', 'success', 100);
      this.updateStepStatus('ffmpeg', 'success', 100);
      this.updateStepStatus('model', 'success', 100);
    }
  }

  showErrors(errors) {
    const container = document.getElementById('errorContainer');
    const errorHtml = errors.map(error => {
      // Check if error message contains installation instructions
      const hasInstructions = error.error.includes('To install') || error.error.includes('Option');
      
      if (hasInstructions) {
        // Format instructions nicely
        const formattedError = error.error
          .replace(/\n/g, '<br>')
          .replace(/Option (\d+)/g, '<strong>Option $1</strong>')
          .replace(/^\d+\./gm, '<br>$&'); // Add line breaks before numbered steps
        
        return `
          <div class="error-message">
            <strong>${error.component}</strong> is missing.<br><br>
            <div style="background: #fff; padding: 1rem; border-radius: 4px; margin-top: 0.5rem; font-family: monospace; font-size: 0.85rem; white-space: pre-wrap;">
              ${formattedError}
            </div>
          </div>
        `;
      } else {
        return `
          <div class="error-message">
            <strong>${error.component}</strong>: ${error.error}
          </div>
        `;
      }
    }).join('');
    container.innerHTML = errorHtml;
  }

  showError(message) {
    const container = document.getElementById('errorContainer');
    // Check if message contains installation instructions
    const hasInstructions = message.includes('To install') || message.includes('Option');
    
    if (hasInstructions) {
      const formattedMessage = message
        .replace(/\n/g, '<br>')
        .replace(/Option (\d+)/g, '<strong>Option $1</strong>')
        .replace(/^\d+\./gm, '<br>$&');
      
      container.innerHTML = `
        <div class="error-message">
          <div style="background: #fff; padding: 1rem; border-radius: 4px; margin-top: 0.5rem; font-family: monospace; font-size: 0.85rem; white-space: pre-wrap;">
            ${formattedMessage}
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `<div class="error-message">${message}</div>`;
    }
  }
}

// Initialize setup UI
document.addEventListener('DOMContentLoaded', () => {
  const setupUI = new SetupUI();
  window.setupUI = setupUI;
});


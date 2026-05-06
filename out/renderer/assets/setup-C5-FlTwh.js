/* empty css                */
class SetupUI {
  setupComplete = false;
  setupInProgress = false;
  constructor() {
    this.setupEventListeners();
  }
  setupEventListeners() {
    document.getElementById("startSetupBtn")?.addEventListener("click", () => {
      this.startSetup();
    });
    document.getElementById("continueBtn")?.addEventListener("click", () => {
      if (window.electronAPI.notifySetupFinished) {
        window.electronAPI.notifySetupFinished();
      } else {
        window.location.href = "index.html";
      }
    });
  }
  updateStepStatus(step, status, progress = 0, message = "") {
    const icon = document.getElementById(`${step}Icon`);
    const statusText = document.getElementById(`${step}Status`);
    const progressBar = document.getElementById(`${step}Progress`);
    const progressFill = document.getElementById(`${step}ProgressFill`);
    const messageEl = document.getElementById(`${step}Message`);
    if (icon) icon.className = `status-icon ${status}`;
    if (statusText) {
      const statusMessages = {
        pending: "Waiting...",
        downloading: "Downloading...",
        success: "Ready",
        error: "Failed"
      };
      statusText.textContent = statusMessages[status] || status;
    }
    if (progressBar && progressFill) {
      if (status === "downloading") {
        progressBar.style.display = "block";
        progressFill.style.width = `${progress}%`;
      } else {
        progressBar.style.display = "none";
      }
    }
    if (messageEl) messageEl.textContent = message;
  }
  async startSetup() {
    if (this.setupInProgress) return;
    this.setupInProgress = true;
    const startBtn = document.getElementById("startSetupBtn");
    if (startBtn) startBtn.disabled = true;
    const errorContainer = document.getElementById("errorContainer");
    if (errorContainer) errorContainer.innerHTML = "";
    try {
      ;
      window.electronAPI.onProgress((_event, data) => {
        this.handleProgressUpdate(data);
      });
      const result = await window.electronAPI.performSetup();
      if (result.success) {
        this.setupComplete = true;
        this.updateStepStatus("whisper", "success", 100);
        this.updateStepStatus("ffmpeg", "success", 100);
        this.updateStepStatus("model", "success", 100);
        const successContainer = document.getElementById("successContainer");
        if (successContainer) successContainer.style.display = "block";
        const continueBtn = document.getElementById("continueBtn");
        if (continueBtn) continueBtn.style.display = "inline-block";
        if (startBtn) startBtn.style.display = "none";
        if (window.electronAPI.notifySetupFinished) {
          ;
          window.electronAPI.notifySetupFinished();
        }
      }
    } catch (error) {
      this.showError(error.message);
    } finally {
      this.setupInProgress = false;
      if (!this.setupComplete && startBtn) {
        startBtn.disabled = false;
      }
    }
  }
  handleProgressUpdate(data) {
    if (data.step === "whisper") {
      this.updateStepStatus("whisper", "downloading", data.progress || 0, data.message);
    } else if (data.step === "ffmpeg") {
      this.updateStepStatus("ffmpeg", "downloading", data.progress || 0, data.message);
    } else if (data.step === "model") {
      this.updateStepStatus("model", "downloading", data.progress || 0, data.message);
    } else if (data.step === "complete") {
      this.updateStepStatus("whisper", "success", 100);
      this.updateStepStatus("ffmpeg", "success", 100);
      this.updateStepStatus("model", "success", 100);
    }
  }
  showError(message) {
    const container = document.getElementById("errorContainer");
    if (container) {
      container.innerHTML = `<div class="error-message">${message}</div>`;
    }
  }
}
document.addEventListener("DOMContentLoaded", () => {
  window.setupUI = new SetupUI();
});

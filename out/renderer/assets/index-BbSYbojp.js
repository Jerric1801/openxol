/* empty css                */
class FileHandler {
  queue = [];
  constructor() {
    this.setupEventListeners();
  }
  setupEventListeners() {
    const uploadArea = document.getElementById("uploadArea");
    const fileInput = document.getElementById("fileInput");
    uploadArea?.addEventListener("click", async () => {
      const filePath = await window.electronAPI.selectAudioFile();
      if (filePath) {
        this.addToQueue(filePath, null);
        this.updateQueueDisplay();
      }
    });
    fileInput?.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      files.forEach((file) => {
        if (file.path) {
          this.addToQueue(file.path, file);
        }
      });
      this.updateQueueDisplay();
    });
    uploadArea?.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.classList.add("dragover");
    });
    uploadArea?.addEventListener("dragleave", () => {
      uploadArea.classList.remove("dragover");
    });
    uploadArea?.addEventListener("drop", async (e) => {
      e.preventDefault();
      uploadArea.classList.remove("dragover");
      const files = Array.from(e.dataTransfer?.files || []);
      for (const file of files) {
        const isAudio = file.type.startsWith("audio/") || [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"].some(
          (ext) => file.name.toLowerCase().endsWith(ext)
        );
        if (isAudio) {
          const filePath = file.path || file.name;
          this.addToQueue(filePath, file);
        }
      }
      this.updateQueueDisplay();
    });
  }
  addToQueue(filePath, file) {
    const pathParts = filePath.split(/[/\\]/);
    const fileName = pathParts[pathParts.length - 1];
    const queueItem = {
      id: Date.now() + Math.random(),
      path: filePath,
      name: file?.name || fileName || "Unknown File",
      status: "pending",
      progress: 0,
      currentStep: null,
      stepMessage: null,
      file
    };
    this.queue.push(queueItem);
  }
  updateQueueDisplay() {
    const queueContainer = document.getElementById("fileQueue");
    if (!queueContainer) return;
    if (this.queue.length === 0) {
      queueContainer.innerHTML = '<p class="empty-queue">No files in queue</p>';
      return;
    }
    queueContainer.innerHTML = this.queue.map(
      (item) => `
      <div class="queue-item" data-id="${item.id}">
        <div class="queue-item-info">
          <div class="queue-item-name">${this.escapeHtml(item.name)}</div>
          <div class="queue-item-status status-${item.status}">${this.getStatusText(item.status)}</div>
          ${item.status === "processing" ? `
            <div class="progress-container">
              <div class="progress-header">
                <span class="progress-step-name">${this.getStepDisplayName(item.currentStep)}</span>
                <span class="progress-percentage">${Math.round(item.progress)}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${item.progress}%"></div>
                <div class="progress-shine"></div>
              </div>
              ${item.stepMessage ? `<div class="progress-message">${this.escapeHtml(item.stepMessage)}</div>` : ""}
            </div>
          ` : ""}
          ${item.status === "error" || item.status === "completed" ? `
            <div class="queue-item-actions">
              ${item.status === "error" ? `<button class="retry-btn" data-item-id="${item.id}" title="Retry processing">🔄 Retry</button>` : ""}
              <button class="remove-btn" data-item-id="${item.id}" title="Remove from queue">×</button>
            </div>
          ` : ""}
        </div>
      </div>
    `
    ).join("");
    queueContainer.querySelectorAll(".retry-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const itemId = parseFloat(e.target.dataset.itemId || "0");
        const item = this.queue.find((q) => q.id === itemId);
        if (item) {
          item.status = "pending";
          item.progress = 0;
          this.updateQueueDisplay();
        }
      });
    });
    queueContainer.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const itemId = parseFloat(e.target.dataset.itemId || "0");
        this.queue = this.queue.filter((q) => q.id !== itemId);
        this.updateQueueDisplay();
      });
    });
  }
  getStatusText(status) {
    const statusMap = {
      pending: "Pending",
      processing: "Processing...",
      completed: "Completed",
      error: "Error"
    };
    return statusMap[status] || status;
  }
  getStepDisplayName(step) {
    const stepNames = {
      transcription: "Transcribing",
      diarization: "Identifying Speakers",
      analysis: "Analyzing",
      document: "Generating Report",
      complete: "Complete",
      error: "Error"
    };
    return stepNames[step || ""] || "Processing";
  }
  updateItemStatus(id, status, progress = 0, currentStep = null, stepMessage = null) {
    const item = this.queue.find((q) => q.id === id);
    if (item) {
      item.status = status;
      item.progress = progress;
      item.currentStep = currentStep;
      item.stepMessage = stepMessage;
      this.updateQueueDisplay();
    }
  }
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  getQueue() {
    return this.queue;
  }
  clearCompleted() {
    this.queue = this.queue.filter((item) => item.status !== "completed");
    this.updateQueueDisplay();
  }
}
const fileHandler = new FileHandler();
class ConfigManager {
  config = null;
  async loadConfig() {
    try {
      this.config = await window.electronAPI.getConfig();
      this.applyConfigToUI();
    } catch (error) {
      console.error("Failed to load config:", error);
      this.config = this.getDefaultConfig();
    }
  }
  async saveConfig() {
    const config = this.getConfigFromUI();
    try {
      await window.electronAPI.saveConfig(config);
      this.config = config;
      this.showMessage("Configuration saved successfully", "success");
    } catch (error) {
      console.error("Failed to save config:", error);
      this.showMessage("Failed to save configuration", "error");
    }
  }
  getConfigFromUI() {
    return {
      transcription: {
        model: document.getElementById("transcriptionModel")?.value || "base.en",
        language: "",
        useGpu: true
      },
      diarization: {
        enabled: document.getElementById("diarizationEnabled")?.checked || false,
        method: document.getElementById("diarizationMethod")?.value || "whisper-native"
      },
      analysis: {
        enabled: document.getElementById("analysisEnabled")?.checked !== false,
        apiKey: document.getElementById("apiKey")?.value || "",
        model: document.getElementById("analysisModel")?.value || "gemini-2.5-flash-lite"
      },
      document: {
        enabled: true,
        includeToc: true,
        includeSpeakerAnalysis: true
      },
      output: {
        directory: document.getElementById("outputDirectory")?.value || "",
        useTimestampedDirs: document.getElementById("useTimestampedDirs")?.checked !== false
      }
    };
  }
  applyConfigToUI() {
    if (!this.config) return;
    if (this.config.transcription) {
      document.getElementById("transcriptionModel").value = this.config.transcription.model || "base.en";
    }
    if (this.config.diarization) {
      const diarizationEnabled = document.getElementById("diarizationEnabled");
      if (diarizationEnabled) diarizationEnabled.checked = this.config.diarization.enabled || false;
      const diarizationMethod = document.getElementById("diarizationMethod");
      if (diarizationMethod) diarizationMethod.value = this.config.diarization.method || "whisper-native";
    }
    if (this.config.analysis) {
      document.getElementById("analysisEnabled").checked = this.config.analysis.enabled !== false;
      document.getElementById("apiKey").value = this.config.analysis.apiKey || "";
      document.getElementById("analysisModel").value = this.config.analysis.model || "gemini-2.0-flash-exp";
    }
    if (this.config.output) {
      const outputDirectory = document.getElementById("outputDirectory");
      if (outputDirectory) outputDirectory.value = this.config.output.directory || "";
      const useTimestampedDirs = document.getElementById("useTimestampedDirs");
      if (useTimestampedDirs) useTimestampedDirs.checked = this.config.output.useTimestampedDirs !== false;
    }
  }
  getDefaultConfig() {
    return {
      transcription: { model: "base.en", language: "", useGpu: true },
      diarization: { enabled: false, method: "whisper-native" },
      analysis: { enabled: true, apiKey: "", model: "gemini-2.0-flash-exp" },
      document: { enabled: true, includeToc: true, includeSpeakerAnalysis: true },
      output: { directory: "", useTimestampedDirs: true }
    };
  }
  getConfig() {
    return this.config || this.getConfigFromUI();
  }
  showMessage(message, type = "info") {
    const statusBar = document.getElementById("statusBar");
    if (statusBar) {
      statusBar.textContent = message;
      statusBar.className = `status-bar ${type}`;
      setTimeout(() => {
        statusBar.className = "status-bar";
        statusBar.textContent = "Ready";
      }, 3e3);
    }
  }
}
const configManager = new ConfigManager();
function initConfigUI() {
  configManager.loadConfig();
  document.getElementById("configToggle")?.addEventListener("click", () => {
    const panel = document.getElementById("configPanel");
    if (panel) {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });
  document.getElementById("saveConfig")?.addEventListener("click", () => {
    configManager.saveConfig();
  });
  document.getElementById("selectOutputDir")?.addEventListener("click", async () => {
    const path = await window.electronAPI.selectOutputDirectory();
    if (path) {
      const outputDirectory = document.getElementById("outputDirectory");
      if (outputDirectory) outputDirectory.value = path;
    }
  });
}
class ResultsManager {
  currentResult = null;
  constructor() {
    this.setupTabs();
  }
  setupTabs() {
    const tabButtons = document.querySelectorAll(".tab-button");
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tabName = button.dataset.tab;
        if (tabName) this.switchTab(tabName);
      });
    });
  }
  switchTab(tabName) {
    document.querySelectorAll(".tab-button").forEach((btn) => {
      btn.classList.remove("active");
    });
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add("active");
    document.querySelectorAll(".tab-content").forEach((content) => {
      content.style.display = "none";
    });
    const tabEl = document.getElementById(`${tabName}Tab`);
    if (tabEl) tabEl.style.display = "block";
    if (tabName === "downloads") {
      this.updateDownloadsTab();
    }
  }
  displayResults(result) {
    if (!result) return;
    this.currentResult = result;
    const resultsSection = document.getElementById("resultsSection");
    if (!resultsSection) return;
    resultsSection.style.display = "block";
    this.switchTab("transcript");
    this.displayWorkflowStatus(result);
    if (result.errors && result.errors.length > 0) {
      this.displayErrors(result.errors);
    }
    const transcriptText = result.diarized?.text || result.transcript?.text || "No transcript available.";
    const transcriptContent = document.getElementById("transcriptContent");
    if (transcriptContent) {
      transcriptContent.textContent = transcriptText;
    }
    this.displayAnalysis(result.analysis);
    this.updateDownloadsTab();
    setTimeout(() => {
      resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }
  displayWorkflowStatus(result) {
    const steps = [
      { name: "Transcription", key: "transcript", errorKey: "transcription" },
      { name: "Diarization", key: "diarized", errorKey: "diarization" },
      { name: "AI Analysis", key: "analysis", errorKey: "analysis" },
      { name: "Document Generation", key: "docxPath", errorKey: "docx" }
    ];
    const statusContainer = document.createElement("div");
    statusContainer.className = "workflow-status";
    const statusItems = steps.map((step) => {
      const hasResult = !!result[step.key];
      const error = result.errors?.find((e) => e.step === step.errorKey);
      let icon = "⏳", cls = "pending", txt = "Not started";
      if (error) {
        icon = error.critical ? "❌" : "⚠️";
        cls = error.critical ? "error-critical" : "error-warning";
        txt = error.critical ? "Failed (Critical)" : "Failed (Non-critical)";
      } else if (hasResult) {
        icon = "✅";
        cls = "success";
        txt = "Completed";
      }
      return `
        <div class="workflow-step ${cls}">
          <span class="workflow-step-icon">${icon}</span>
          <span class="workflow-step-name">${step.name}</span>
          <span class="workflow-step-status">${txt}</span>
        </div>
      `;
    }).join("");
    statusContainer.innerHTML = `<h3>Processing Status</h3><div class="workflow-steps">${statusItems}</div>`;
    const resultsSection = document.getElementById("resultsSection");
    resultsSection?.querySelector(".workflow-status")?.remove();
    resultsSection?.insertBefore(statusContainer, resultsSection.querySelector("h2")?.nextSibling || null);
  }
  displayErrors(errors) {
    const errorsContainer = document.createElement("div");
    errorsContainer.className = "results-errors";
    const critical = errors.filter((e) => e.critical);
    const nonCritical = errors.filter((e) => !e.critical);
    let content = "";
    if (critical.length > 0) {
      content += `
        <div class="error-section critical">
          <h3>❌ Critical Errors</h3>
          <ul class="error-list">
            ${critical.map((e) => `<li><strong>${e.step}:</strong> ${this.escapeHtml(e.error)}</li>`).join("")}
          </ul>
        </div>
      `;
    }
    if (nonCritical.length > 0) {
      content += `
        <div class="error-section warning">
          <h3>⚠️ Warnings</h3>
          <ul class="error-list">
            ${nonCritical.map((e) => `<li><strong>${e.step}:</strong> ${this.escapeHtml(e.error)}</li>`).join("")}
          </ul>
        </div>
      `;
    }
    errorsContainer.innerHTML = content;
    const resultsSection = document.getElementById("resultsSection");
    resultsSection?.querySelector(".results-errors")?.remove();
    resultsSection?.querySelector(".workflow-status")?.insertAdjacentElement("afterend", errorsContainer);
  }
  displayAnalysis(analysis) {
    const analysisContent = document.getElementById("analysisContent");
    if (!analysisContent) return;
    if (!analysis) {
      analysisContent.innerHTML = `<p class="no-content">No analysis available.</p>`;
      return;
    }
    const sections = [
      { title: "Meeting Synthesis", content: analysis.synthesis || "" },
      { title: "Action Items", content: analysis.actionItems || "" },
      { title: "Critique & Analysis", content: analysis.critique || "" },
      { title: "Key Insights", content: analysis.insights || "" }
    ];
    analysisContent.innerHTML = sections.map(
      (section) => `
      <div class="analysis-section">
        <h3>${section.title}</h3>
        <div>${this.formatText(section.content)}</div>
      </div>
    `
    ).join("");
  }
  formatText(text) {
    if (!text) return "<p>No content</p>";
    return text.split("\n").filter((line) => line.trim()).map((line) => `<p>${this.escapeHtml(line.trim())}</p>`).join("");
  }
  updateDownloadsTab() {
    const downloadsContent = document.getElementById("downloadsContent");
    if (!downloadsContent || !this.currentResult) return;
    const downloads = [];
    if (this.currentResult.transcript) {
      downloads.push({ name: "Transcript (TXT)", action: () => this.downloadTranscript() });
    }
    if (this.currentResult.analysis) {
      downloads.push({ name: "Analysis (TXT)", action: () => this.downloadAnalysis() });
    }
    if (this.currentResult.docxPath) {
      downloads.push({ name: "Full Report (DOCX)", action: () => {
      } });
    }
    downloadsContent.innerHTML = downloads.map((d) => `<a href="#" class="download-button" data-action="${d.name}">${d.name}</a>`).join("");
    downloadsContent.querySelectorAll(".download-button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const action = downloads.find((d) => d.name === btn.dataset.action);
        if (action) action.action();
      });
    });
  }
  downloadTranscript() {
    const text = this.currentResult?.diarized?.text || this.currentResult?.transcript?.text || "No transcript available.";
    this.downloadText(text, "transcript.txt");
  }
  downloadAnalysis() {
    const a = this.currentResult?.analysis;
    if (!a) return;
    const text = `Synthesis:
${a.synthesis}

Action Items:
${a.actionItems}

Critique:
${a.critique}

Insights:
${a.insights}`;
    this.downloadText(text, "analysis.txt");
  }
  downloadText(text, filename) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}
const resultsManager = new ResultsManager();
class ErrorHandler {
  errors = [];
  constructor() {
    this.setupErrorModal();
  }
  setupErrorModal() {
    if (!document.getElementById("errorModal")) {
      const modal = document.createElement("div");
      modal.id = "errorModal";
      modal.className = "error-modal";
      modal.innerHTML = `
        <div class="error-modal-content">
          <div class="error-modal-header">
            <h2>⚠️ Error</h2>
            <button class="error-modal-close" id="errorModalClose">&times;</button>
          </div>
          <div class="error-modal-body">
            <div class="error-message" id="errorMessage"></div>
            <div class="error-details" id="errorDetails"></div>
            <div class="error-actions" id="errorActions"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById("errorModalClose")?.addEventListener("click", () => {
        this.hideError();
      });
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          this.hideError();
        }
      });
    }
  }
  parseError(error) {
    const errorMessage = error.message || error.toString();
    const errorDetails = error.details || errorMessage;
    const errorString = errorMessage.toLowerCase();
    if (errorString.includes("binary") || errorString.includes("whisper") || errorString.includes("ffmpeg")) {
      return {
        type: "missing_binary",
        title: "Missing Required Software",
        message: "A required component is missing or not found.",
        details: errorDetails,
        actions: [
          {
            label: "Run Setup",
            action: () => {
              window.location.href = "setup.html";
            }
          },
          {
            label: "Check Installation",
            action: () => {
              this.showInstallationInstructions(errorMessage);
            }
          }
        ]
      };
    }
    if (errorString.includes("api key") || errorString.includes("gemini") || errorString.includes("authentication")) {
      return {
        type: "api_error",
        title: "API Configuration Error",
        message: "There was an issue with the AI analysis API.",
        details: errorDetails,
        actions: [
          {
            label: "Configure API Key",
            action: () => {
              document.getElementById("configToggle")?.click();
              document.getElementById("apiKey")?.focus();
            }
          },
          {
            label: "Continue Without Analysis",
            action: () => "skip_analysis"
          }
        ]
      };
    }
    return {
      type: "generic",
      title: "Processing Error",
      message: "An unexpected error occurred during processing.",
      details: errorMessage,
      actions: [
        {
          label: "Retry",
          action: () => "retry"
        },
        {
          label: "Report Issue",
          action: () => {
            this.copyErrorToClipboard(errorMessage);
            alert("Error details copied to clipboard.");
          }
        }
      ]
    };
  }
  showError(error) {
    const parsed = this.parseError(error);
    this.errors.push(parsed);
    const modal = document.getElementById("errorModal");
    const messageEl = document.getElementById("errorMessage");
    const detailsEl = document.getElementById("errorDetails");
    const actionsEl = document.getElementById("errorActions");
    if (modal && messageEl && detailsEl && actionsEl) {
      messageEl.innerHTML = `<strong>${parsed.title}</strong><p>${parsed.message}</p>`;
      detailsEl.innerHTML = `<details><summary>Error Details</summary><pre>${this.escapeHtml(
        parsed.details
      )}</pre></details>`;
      actionsEl.innerHTML = parsed.actions.map(
        (action, index) => `<button class="error-action-btn" data-action-index="${index}">${action.label}</button>`
      ).join("");
      actionsEl.querySelectorAll(".error-action-btn").forEach((btn, index) => {
        btn.addEventListener("click", () => {
          const result = parsed.actions[index].action();
          if (result === "retry" || result === "skip_analysis") {
            this.hideError();
          }
        });
      });
      modal.style.display = "flex";
    }
    return parsed;
  }
  hideError() {
    const modal = document.getElementById("errorModal");
    if (modal) {
      modal.style.display = "none";
    }
  }
  showInstallationInstructions(errorMessage) {
    alert(`Binary missing. Please run setup. Error: ${errorMessage}`);
  }
  copyErrorToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    });
  }
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  showErrorBanner(errors) {
    const banner = document.createElement("div");
    banner.className = "error-banner";
    banner.innerHTML = `
      <div class="error-banner-content">
        <span>⚠️ Some steps failed:</span>
        <ul>
          ${errors.map((e) => `<li>${e.step}: ${e.error}</li>`).join("")}
        </ul>
        <button class="error-banner-close">×</button>
      </div>
    `;
    banner.querySelector(".error-banner-close")?.addEventListener("click", () => banner.remove());
    const resultsSection = document.getElementById("resultsSection");
    if (resultsSection) {
      resultsSection.insertBefore(banner, resultsSection.firstChild);
    }
  }
}
const errorHandler = new ErrorHandler();
class App {
  isProcessing = false;
  currentProcessingItem = null;
  partialResults = null;
  constructor() {
    this.setupEventListeners();
    this.setupProgressListener();
  }
  setupEventListeners() {
    setInterval(() => {
      const queue = fileHandler.getQueue();
      const pendingItems = queue.filter((item) => item.status === "pending");
      if (pendingItems.length > 0 && !this.isProcessing) {
        this.processNextFile();
      }
    }, 1e3);
    document.getElementById("cancelBtn")?.addEventListener("click", () => {
      this.cancelProcessing();
    });
  }
  setupProgressListener() {
    window.electronAPI.onProcessingProgress((_event, progress) => {
      if (this.currentProcessingItem && progress) {
        if (progress.step === "partial-result" && progress.type === "transcription") {
          this.partialResults = progress.result;
          resultsManager.displayResults(progress.result);
          this.updateStatus("Transcription ready - continuing...", "success");
          return;
        }
        const progressPercent = progress.overallProgress !== void 0 ? progress.overallProgress : progress.progress || 0;
        fileHandler.updateItemStatus(
          this.currentProcessingItem.id,
          "processing",
          progressPercent,
          progress.step || "processing",
          progress.message || "Processing..."
        );
        const stepName = this.getStepDisplayName(progress.step);
        this.updateStatus(`${stepName}: ${progress.message || ""}`, "processing");
      }
    });
  }
  getStepDisplayName(step) {
    const stepNames = {
      transcription: "Transcribing",
      diarization: "Identifying Speakers",
      analysis: "Analyzing",
      document: "Generating Report",
      complete: "Complete",
      error: "Error"
    };
    return stepNames[step || ""] || "Processing";
  }
  async processNextFile() {
    const queue = fileHandler.getQueue();
    const pendingItem = queue.find((item) => item.status === "pending");
    if (!pendingItem || this.isProcessing) return;
    this.isProcessing = true;
    this.currentProcessingItem = pendingItem;
    this.partialResults = null;
    fileHandler.updateItemStatus(pendingItem.id, "processing", 0);
    const heroSection = document.getElementById("heroSection");
    heroSection?.classList.add("hero-active");
    this.updateStatus("Neural engines warming up...", "processing");
    this.showCancelButton(true);
    try {
      const config = configManager.getConfig();
      const result = await window.electronAPI.processAudio(pendingItem.path, config);
      if (result.success) {
        fileHandler.updateItemStatus(pendingItem.id, "completed", 100);
        resultsManager.displayResults(result.result);
        this.updateStatus("Insight generation successful", "success");
      } else {
        fileHandler.updateItemStatus(pendingItem.id, "error", 0);
        errorHandler.showError({ message: result.message || "Unknown error" });
        this.updateStatus(`Neural glitch: ${result.message}`, "error");
      }
    } catch (error) {
      fileHandler.updateItemStatus(pendingItem.id, "error", 0);
      errorHandler.showError(error);
      this.updateStatus(`Neural glitch: ${error.message}`, "error");
    } finally {
      this.isProcessing = false;
      this.currentProcessingItem = null;
      heroSection?.classList.remove("hero-active");
      this.showCancelButton(false);
    }
  }
  showCancelButton(show) {
    const btn = document.getElementById("cancelBtn");
    if (btn) btn.style.display = show ? "inline-block" : "none";
  }
  async cancelProcessing() {
    if (this.isProcessing) {
      try {
        await window.electronAPI.cancelProcessing();
        this.updateStatus("Cancelling...", "warning");
      } catch (error) {
        console.error("Failed to cancel:", error);
      }
    }
  }
  updateStatus(message, type = "info") {
    const statusBar = document.getElementById("statusBar");
    if (statusBar) {
      statusBar.textContent = message;
      statusBar.className = `status-bar ${type}`;
    }
  }
}
document.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
  initConfigUI();
});

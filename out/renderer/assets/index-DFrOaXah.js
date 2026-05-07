/* empty css                */
class FileHandler {
  queue = [];
  constructor() {
    this.setupEventListeners();
  }
  setupEventListeners() {
    document.getElementById("queueSearch")?.addEventListener("input", () => this.updateQueueDisplay());
    document.getElementById("queueFilter")?.addEventListener("change", () => this.updateQueueDisplay());
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
      file,
      timestamp: Date.now(),
      result: null
    };
    this.queue.push(queueItem);
  }
  getFilteredQueue() {
    const search = document.getElementById("queueSearch")?.value?.toLowerCase() || "";
    const filter = document.getElementById("queueFilter")?.value || "all";
    return this.queue.filter((item) => {
      const matchesSearch = !search || item.name.toLowerCase().includes(search);
      const matchesFilter = filter === "all" || item.status === filter;
      return matchesSearch && matchesFilter;
    });
  }
  formatTimeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1e3);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(ts).toLocaleDateString();
  }
  updateQueueDisplay() {
    const queueContainer = document.getElementById("fileQueue");
    if (!queueContainer) return;
    const visible = this.getFilteredQueue();
    if (this.queue.length === 0) {
      queueContainer.innerHTML = `
        <div class="sessions-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
          <p>No sessions yet</p>
          <span>Upload a file or start recording above</span>
        </div>`;
      return;
    }
    if (visible.length === 0) {
      queueContainer.innerHTML = `<div class="sessions-empty"><p>No matches</p></div>`;
      return;
    }
    queueContainer.innerHTML = visible.slice().reverse().map(
      (item) => `
      <div class="queue-item" data-id="${item.id}">
        <div class="queue-item-row">
          <span class="status-badge status-badge--${item.status}">${this.getStatusText(item.status)}</span>
          <span class="queue-item-name" title="${this.escapeHtml(item.path)}">${this.escapeHtml(item.name)}</span>
          <span class="queue-item-time">${this.formatTimeAgo(item.timestamp)}</span>
        </div>
        ${item.status === "processing" ? `<div class="progress-container" style="margin-top:0.5rem;">
                <div class="progress-header">
                  <span class="progress-step-name">${this.getStepDisplayName(item.currentStep)}</span>
                  <span class="progress-percentage">${Math.round(item.progress)}%</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width:${item.progress}%"></div>
                </div>
              </div>` : ""}
        ${item.status === "completed" || item.status === "error" ? `<div class="queue-item-actions">
                ${item.status === "completed" && item.result ? `<button class="btn-view" data-item-id="${item.id}">View</button>` : ""}
                ${item.status === "error" ? `<button class="retry-btn" data-item-id="${item.id}">Retry</button>` : ""}
                <button class="remove-btn" data-item-id="${item.id}">Remove</button>
              </div>` : ""}
      </div>`
    ).join("");
    queueContainer.querySelectorAll(".btn-view").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const itemId = parseFloat(e.target.dataset.itemId || "0");
        const item = this.queue.find((q) => q.id === itemId);
        if (item?.result) {
          document.dispatchEvent(new CustomEvent("view-result", { detail: { result: item.result, name: item.name } }));
        }
      });
    });
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
  updateItemResult(id, result) {
    const item = this.queue.find((q) => q.id === id);
    if (item) {
      item.result = result;
    }
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
const DEFAULT_SYSTEM_PROMPT = `You are an expert executive assistant and meeting scribe. Analyze the provided meeting transcript to produce a structured, concise summary. Focus on:
- Executive Summary: A 3-4 sentence overview of the meeting's purpose and outcome.
- Key Decisions: A bulleted list of all major decisions made.
- Action Items Table: A markdown table with three columns: 'Action Item', 'Owner', and 'Deadline'. If a deadline is not explicitly mentioned, put 'TBD'.
- Key Themes: Brief notes on main discussion points.
Be concise, remove fluff, and ensure accountability is clear.`;
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
        model: document.getElementById("analysisModel")?.value || "gemini-2.5-flash-lite",
        systemPrompt: this.config?.analysis?.systemPrompt || DEFAULT_SYSTEM_PROMPT
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
      const methodGroup = document.getElementById("diarizationMethodGroup");
      if (methodGroup) methodGroup.style.display = this.config.diarization.enabled ? "flex" : "none";
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
      analysis: { enabled: true, apiKey: "", model: "gemini-2.5-flash-lite", systemPrompt: DEFAULT_SYSTEM_PROMPT },
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
  document.getElementById("diarizationEnabled")?.addEventListener("change", (e) => {
    const enabled = e.target.checked;
    const methodGroup = document.getElementById("diarizationMethodGroup");
    if (methodGroup) methodGroup.style.display = enabled ? "flex" : "none";
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
  document.getElementById("toggleSettings")?.addEventListener("click", () => {
    document.querySelector(".app-body")?.classList.toggle("settings-collapsed");
  });
  const promptModal = document.getElementById("promptModal");
  const promptTextarea = document.getElementById("systemPromptInput");
  document.getElementById("editPromptBtn")?.addEventListener("click", () => {
    if (promptModal && promptTextarea) {
      promptTextarea.value = configManager.getConfig().analysis?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
      promptModal.style.display = "flex";
    }
  });
  const closeModal = () => {
    if (promptModal) promptModal.style.display = "none";
  };
  document.getElementById("promptModalClose")?.addEventListener("click", closeModal);
  promptModal?.addEventListener("click", (e) => {
    if (e.target === promptModal) closeModal();
  });
  document.getElementById("promptModalReset")?.addEventListener("click", () => {
    if (promptTextarea) promptTextarea.value = DEFAULT_SYSTEM_PROMPT;
  });
  document.getElementById("promptModalSave")?.addEventListener("click", async () => {
    if (promptTextarea && configManager.getConfig()) {
      const updated = configManager.getConfig();
      updated.analysis.systemPrompt = promptTextarea.value.trim() || DEFAULT_SYSTEM_PROMPT;
      await window.electronAPI.saveConfig(updated);
      configManager.config = updated;
    }
    closeModal();
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
    document.getElementById("closeResults")?.addEventListener("click", () => {
      document.querySelector(".app-body")?.classList.remove("has-results");
      const resultsSection = document.getElementById("resultsSection");
      if (resultsSection) resultsSection.style.display = "none";
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
  displayResults(result, filename = "") {
    if (!result) return;
    this.currentResult = result;
    const resultsSection = document.getElementById("resultsSection");
    if (!resultsSection) return;
    resultsSection.style.display = "flex";
    resultsSection.style.flexDirection = "column";
    document.querySelector(".app-body")?.classList.add("has-results");
    this.switchTab("transcript");
    const filenameEl = document.getElementById("resultsFilename");
    if (filenameEl) filenameEl.textContent = filename;
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
      let cls = "pending", txt = "Pending";
      if (error) {
        cls = error.critical ? "error-critical" : "error-warning";
        txt = error.critical ? "Failed" : "Warning";
      } else if (hasResult) {
        cls = "success";
        txt = "Complete";
      }
      return `
        <div class="workflow-step ${cls}">
          <div class="workflow-step-row">
            <span class="workflow-step-dot"></span>
            <span class="workflow-step-name">${step.name}</span>
          </div>
          <span class="workflow-step-status">${txt}</span>
        </div>
      `;
    }).join("");
    statusContainer.innerHTML = `<h3>Processing Status</h3><div class="workflow-steps">${statusItems}</div>`;
    const resultsSection = document.getElementById("resultsSection");
    resultsSection?.querySelector(".workflow-status")?.remove();
    const resultsHeader = resultsSection?.querySelector(".results-header");
    resultsSection?.insertBefore(statusContainer, resultsHeader?.nextSibling || null);
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
      { title: "Executive Summary", content: analysis.executiveSummary || "" },
      { title: "Key Decisions", content: analysis.keyDecisions || "" },
      { title: "Action Items", content: analysis.actionItems || "" },
      { title: "Key Themes", content: analysis.keyThemes || "" }
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
    const text = `Executive Summary:
${a.executiveSummary}

Key Decisions:
${a.keyDecisions}

Action Items:
${a.actionItems}

Key Themes:
${a.keyThemes}`;
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
    document.addEventListener("view-result", (e) => {
      const { result, name } = e.detail;
      resultsManager.displayResults(result, name);
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
    this.updateStatus("Processing...", "processing");
    this.showCancelButton(true);
    try {
      const config = configManager.getConfig();
      const result = await window.electronAPI.processAudio(pendingItem.path, config);
      if (result.success) {
        fileHandler.updateItemResult(pendingItem.id, result.result);
        fileHandler.updateItemStatus(pendingItem.id, "completed", 100);
        resultsManager.displayResults(result.result, pendingItem.name);
        this.updateStatus("Analysis complete", "success");
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
      this.showCancelButton(false);
    }
  }
  showCancelButton(show) {
    const btn = document.getElementById("cancelBtn");
    if (btn) btn.style.display = show ? "flex" : "none";
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
    const pill = document.getElementById("statusBar");
    if (pill) {
      pill.className = `status-pill ${type}`;
      const textEl = pill.querySelector(".status-text");
      if (textEl) textEl.textContent = message;
    }
  }
}
class RecordingUI {
  mediaRecorder = null;
  stream = null;
  analyser = null;
  audioContext = null;
  animFrameId = null;
  timerInterval = null;
  startTime = 0;
  isRecording = false;
  constructor() {
    this.setupEventListeners();
  }
  setupEventListeners() {
    document.getElementById("recordArea")?.addEventListener("click", () => {
      this.startRecording();
    });
    document.getElementById("stopRecordBtn")?.addEventListener("click", () => {
      this.stopRecording();
    });
    document.getElementById("cancelRecordBtn")?.addEventListener("click", () => {
      this.cancelRecording();
    });
  }
  async startRecording() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);
      const ok = await window.electronAPI.startRecording();
      if (!ok) throw new Error("Main process failed to open recording file");
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          e.data.arrayBuffer().then((buf) => {
            ;
            window.electronAPI.sendRecordingChunk(buf);
          });
        }
      };
      this.mediaRecorder.start(500);
      this.isRecording = true;
      this.startTime = Date.now();
      this.showRecordingUI();
      this.startTimer();
      this.startWaveform();
    } catch (err) {
      console.error("Recording start failed:", err);
      this.resetUI();
      if (err.name === "NotAllowedError") {
        alert("Microphone permission denied. Allow mic access and try again.");
      }
    }
  }
  async stopRecording() {
    if (!this.isRecording) return;
    this.mediaRecorder?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    const wavPath = await window.electronAPI.stopRecording();
    this.cleanup();
    this.hideRecordingUI();
    if (wavPath) {
      fileHandler.addToQueue(wavPath, null);
      fileHandler.updateQueueDisplay();
    }
  }
  cancelRecording() {
    if (!this.isRecording) return;
    this.mediaRecorder?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    window.electronAPI.cancelRecording();
    this.cleanup();
    this.hideRecordingUI();
  }
  cleanup() {
    this.isRecording = false;
    if (this.timerInterval !== null) clearInterval(this.timerInterval);
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    this.audioContext?.close();
    this.mediaRecorder = null;
    this.stream = null;
    this.analyser = null;
    this.audioContext = null;
    this.timerInterval = null;
    this.animFrameId = null;
  }
  showRecordingUI() {
    const idle = document.getElementById("heroIdle");
    const rec = document.getElementById("heroRecording");
    const hero = document.getElementById("heroSection");
    if (idle) idle.style.display = "none";
    if (rec) rec.style.display = "flex";
    hero?.classList.add("hero-active");
    const canvas = document.getElementById("waveformCanvas");
    if (canvas) {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
  }
  hideRecordingUI() {
    const idle = document.getElementById("heroIdle");
    const rec = document.getElementById("heroRecording");
    const hero = document.getElementById("heroSection");
    const timer = document.getElementById("recordingTimer");
    if (idle) idle.style.display = "flex";
    if (rec) rec.style.display = "none";
    hero?.classList.remove("hero-active");
    if (timer) timer.textContent = "00:00";
  }
  resetUI() {
    this.cleanup();
    this.hideRecordingUI();
  }
  startTimer() {
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1e3);
      const m = Math.floor(elapsed / 60).toString().padStart(2, "0");
      const s = (elapsed % 60).toString().padStart(2, "0");
      const el = document.getElementById("recordingTimer");
      if (el) el.textContent = `${m}:${s}`;
    }, 1e3);
  }
  startWaveform() {
    const canvas = document.getElementById("waveformCanvas");
    if (!canvas || !this.analyser) return;
    const ctx = canvas.getContext("2d");
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      this.animFrameId = requestAnimationFrame(draw);
      this.analyser.getByteTimeDomainData(dataArray);
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#48D1E2";
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(72, 209, 226, 0.6)";
      ctx.beginPath();
      const sliceWidth = width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128;
        const y = v * height / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };
    draw();
  }
}
new RecordingUI();
document.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
  initConfigUI();
});

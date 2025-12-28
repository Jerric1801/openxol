class FileHandler {
  constructor() {
    this.queue = [];
    this.setupEventListeners();
  }

  setupEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    // Click to browse - use Electron file dialog
    uploadArea.addEventListener('click', async () => {
      const filePath = await window.electronAPI.selectAudioFile();
      if (filePath) {
        this.addToQueue(filePath, null);
        this.updateQueueDisplay();
      }
    });

    // File input change (fallback for web compatibility)
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      files.forEach(file => {
        // For Electron, we'll use the file dialog instead
        // This is a fallback
        if (file.path) {
          this.addToQueue(file.path, file);
        }
      });
      this.updateQueueDisplay();
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', async (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      
      // In Electron, we need to get file paths from the dropped files
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        // Check if it's an audio file
        const isAudio = file.type.startsWith('audio/') || 
          ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'].some(ext => 
            file.name.toLowerCase().endsWith(ext)
          );
        
        if (isAudio) {
          // Use file.path if available (Electron), otherwise use name
          const filePath = file.path || file.name;
          this.addToQueue(filePath, file);
        }
      }
      this.updateQueueDisplay();
    });
  }

  addToQueue(filePath, file) {
    // Extract filename from path (handle both Windows and Unix paths)
    const pathParts = filePath.split(/[/\\]/);
    const fileName = pathParts[pathParts.length - 1];
    
    const queueItem = {
      id: Date.now() + Math.random(),
      path: filePath,
      name: file?.name || fileName,
      status: 'pending',
      progress: 0,
      currentStep: null,
      stepMessage: null,
      file: file
    };
    this.queue.push(queueItem);
  }

  updateQueueDisplay() {
    const queueContainer = document.getElementById('fileQueue');
    
    if (this.queue.length === 0) {
      queueContainer.innerHTML = '<p class="empty-queue">No files in queue</p>';
      return;
    }

    queueContainer.innerHTML = this.queue.map(item => `
      <div class="queue-item" data-id="${item.id}">
        <div class="queue-item-info">
          <div class="queue-item-name">${this.escapeHtml(item.name)}</div>
          <div class="queue-item-status status-${item.status}">${this.getStatusText(item.status)}</div>
          ${item.status === 'processing' ? `
            <div class="progress-container">
              <div class="progress-header">
                <span class="progress-step-name">${this.getStepDisplayName(item.currentStep)}</span>
                <span class="progress-percentage">${Math.round(item.progress)}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${item.progress}%"></div>
                <div class="progress-shine"></div>
              </div>
              ${item.stepMessage ? `<div class="progress-message">${this.escapeHtml(item.stepMessage)}</div>` : ''}
            </div>
          ` : ''}
          ${item.status === 'error' ? `
            <div class="queue-item-actions">
              <button class="retry-btn" data-item-id="${item.id}" title="Retry processing">🔄 Retry</button>
              <button class="remove-btn" data-item-id="${item.id}" title="Remove from queue">×</button>
            </div>
          ` : ''}
          ${item.status === 'completed' ? `
            <div class="queue-item-actions">
              <button class="remove-btn" data-item-id="${item.id}" title="Remove from queue">×</button>
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');

    // Attach event listeners for retry and remove buttons
    queueContainer.querySelectorAll('.retry-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemId = parseFloat(e.target.dataset.itemId);
        const item = this.queue.find(q => q.id === itemId);
        if (item) {
          item.status = 'pending';
          item.progress = 0;
          this.updateQueueDisplay();
        }
      });
    });

    queueContainer.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemId = parseFloat(e.target.dataset.itemId);
        this.queue = this.queue.filter(q => q.id !== itemId);
        this.updateQueueDisplay();
      });
    });
  }

  getStatusText(status) {
    const statusMap = {
      pending: 'Pending',
      processing: 'Processing...',
      completed: 'Completed',
      error: 'Error'
    };
    return statusMap[status] || status;
  }

  getStepDisplayName(step) {
    const stepNames = {
      'transcription': 'Transcribing',
      'diarization': 'Identifying Speakers',
      'analysis': 'Analyzing',
      'document': 'Generating Report',
      'complete': 'Complete',
      'error': 'Error'
    };
    return stepNames[step] || 'Processing';
  }

  updateItemStatus(id, status, progress = 0, currentStep = null, stepMessage = null) {
    const item = this.queue.find(q => q.id === id);
    if (item) {
      item.status = status;
      item.progress = progress;
      item.currentStep = currentStep;
      item.stepMessage = stepMessage;
      this.updateQueueDisplay();
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getQueue() {
    return this.queue;
  }

  clearCompleted() {
    this.queue = this.queue.filter(item => item.status !== 'completed');
    this.updateQueueDisplay();
  }
}

const fileHandler = new FileHandler();


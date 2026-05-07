export interface QueueItem {
  id: number
  path: string
  name: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  currentStep: string | null
  stepMessage: string | null
  file: File | null
  timestamp: number
  result: any | null
}

export class FileHandler {
  private queue: QueueItem[] = []

  constructor() {
    this.setupEventListeners()
  }

  setupEventListeners(): void {
    document.getElementById('queueSearch')?.addEventListener('input', () => this.updateQueueDisplay())
    document.getElementById('queueFilter')?.addEventListener('change', () => this.updateQueueDisplay())

    const uploadArea = document.getElementById('uploadArea')
    const fileInput = document.getElementById('fileInput') as HTMLInputElement

    uploadArea?.addEventListener('click', async () => {
      const filePath = await (window as any).electronAPI.selectAudioFile()
      if (filePath) {
        this.addToQueue(filePath, null)
        this.updateQueueDisplay()
      }
    })

    fileInput?.addEventListener('change', (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      files.forEach((file) => {
        if ((file as any).path) {
          this.addToQueue((file as any).path, file)
        }
      })
      this.updateQueueDisplay()
    })

    uploadArea?.addEventListener('dragover', (e) => {
      e.preventDefault()
      uploadArea.classList.add('dragover')
    })

    uploadArea?.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover')
    })

    uploadArea?.addEventListener('drop', async (e) => {
      e.preventDefault()
      uploadArea.classList.remove('dragover')

      const files = Array.from(e.dataTransfer?.files || [])
      for (const file of files) {
        const isAudio =
          file.type.startsWith('audio/') ||
          ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'].some((ext) =>
            file.name.toLowerCase().endsWith(ext)
          )

        if (isAudio) {
          const filePath = (file as any).path || file.name
          this.addToQueue(filePath, file)
        }
      }
      this.updateQueueDisplay()
    })
  }

  addToQueue(filePath: string, file: File | null): void {
    const pathParts = filePath.split(/[/\\]/)
    const fileName = pathParts[pathParts.length - 1]

    const queueItem: QueueItem = {
      id: Date.now() + Math.random(),
      path: filePath,
      name: file?.name || fileName || 'Unknown File',
      status: 'pending',
      progress: 0,
      currentStep: null,
      stepMessage: null,
      file: file,
      timestamp: Date.now(),
      result: null
    }
    this.queue.push(queueItem)
  }

  private getFilteredQueue(): QueueItem[] {
    const search = (document.getElementById('queueSearch') as HTMLInputElement | null)?.value?.toLowerCase() || ''
    const filter = (document.getElementById('queueFilter') as HTMLSelectElement | null)?.value || 'all'
    return this.queue.filter((item) => {
      const matchesSearch = !search || item.name.toLowerCase().includes(search)
      const matchesFilter = filter === 'all' || item.status === filter
      return matchesSearch && matchesFilter
    })
  }

  private formatTimeAgo(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  updateQueueDisplay(): void {
    const queueContainer = document.getElementById('fileQueue')
    if (!queueContainer) return

    const visible = this.getFilteredQueue()

    if (this.queue.length === 0) {
      queueContainer.innerHTML = `
        <div class="sessions-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
          <p>No sessions yet</p>
          <span>Upload a file or start recording above</span>
        </div>`
      return
    }

    if (visible.length === 0) {
      queueContainer.innerHTML = `<div class="sessions-empty"><p>No matches</p></div>`
      return
    }

    queueContainer.innerHTML = visible
      .slice()
      .reverse()
      .map(
        (item) => `
      <div class="queue-item" data-id="${item.id}">
        <div class="queue-item-row">
          <span class="status-badge status-badge--${item.status}">${this.getStatusText(item.status)}</span>
          <span class="queue-item-name" title="${this.escapeHtml(item.path)}">${this.escapeHtml(item.name)}</span>
          <span class="queue-item-time">${this.formatTimeAgo(item.timestamp)}</span>
        </div>
        ${
          item.status === 'processing'
            ? `<div class="progress-container" style="margin-top:0.5rem;">
                <div class="progress-header">
                  <span class="progress-step-name">${this.getStepDisplayName(item.currentStep)}</span>
                  <span class="progress-percentage">${Math.round(item.progress)}%</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width:${item.progress}%"></div>
                </div>
              </div>`
            : ''
        }
        ${
          item.status === 'completed' || item.status === 'error'
            ? `<div class="queue-item-actions">
                ${item.status === 'completed' && item.result ? `<button class="btn-view" data-item-id="${item.id}">View</button>` : ''}
                ${item.status === 'error' ? `<button class="retry-btn" data-item-id="${item.id}">Retry</button>` : ''}
                <button class="remove-btn" data-item-id="${item.id}">Remove</button>
              </div>`
            : ''
        }
      </div>`
      )
      .join('')

    queueContainer.querySelectorAll('.btn-view').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const itemId = parseFloat((e.target as HTMLElement).dataset.itemId || '0')
        const item = this.queue.find((q) => q.id === itemId)
        if (item?.result) {
          document.dispatchEvent(new CustomEvent('view-result', { detail: { result: item.result, name: item.name } }))
        }
      })
    })

    queueContainer.querySelectorAll('.retry-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const itemId = parseFloat((e.target as HTMLElement).dataset.itemId || '0')
        const item = this.queue.find((q) => q.id === itemId)
        if (item) {
          item.status = 'pending'
          item.progress = 0
          this.updateQueueDisplay()
        }
      })
    })

    queueContainer.querySelectorAll('.remove-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const itemId = parseFloat((e.target as HTMLElement).dataset.itemId || '0')
        this.queue = this.queue.filter((q) => q.id !== itemId)
        this.updateQueueDisplay()
      })
    })
  }

  private getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      pending: 'Pending',
      processing: 'Processing...',
      completed: 'Completed',
      error: 'Error'
    }
    return statusMap[status] || status
  }

  private getStepDisplayName(step: string | null): string {
    const stepNames: Record<string, string> = {
      transcription: 'Transcribing',
      diarization: 'Identifying Speakers',
      analysis: 'Analyzing',
      document: 'Generating Report',
      complete: 'Complete',
      error: 'Error'
    }
    return stepNames[step || ''] || 'Processing'
  }

  updateItemResult(id: number, result: any): void {
    const item = this.queue.find((q) => q.id === id)
    if (item) {
      item.result = result
    }
  }

  updateItemStatus(
    id: number,
    status: QueueItem['status'],
    progress = 0,
    currentStep: string | null = null,
    stepMessage: string | null = null
  ): void {
    const item = this.queue.find((q) => q.id === id)
    if (item) {
      item.status = status
      item.progress = progress
      item.currentStep = currentStep
      item.stepMessage = stepMessage
      this.updateQueueDisplay()
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  getQueue(): QueueItem[] {
    return this.queue
  }

  clearCompleted(): void {
    this.queue = this.queue.filter((item) => item.status !== 'completed')
    this.updateQueueDisplay()
  }
}

export const fileHandler = new FileHandler()

export interface QueueItem {
  id: number
  path: string
  name: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  currentStep: string | null
  stepMessage: string | null
  file: File | null
}

export class FileHandler {
  private queue: QueueItem[] = []

  constructor() {
    this.setupEventListeners()
  }

  setupEventListeners(): void {
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
      file: file
    }
    this.queue.push(queueItem)
  }

  updateQueueDisplay(): void {
    const queueContainer = document.getElementById('fileQueue')
    if (!queueContainer) return

    if (this.queue.length === 0) {
      queueContainer.innerHTML = '<p class="empty-queue">No files in queue</p>'
      return
    }

    queueContainer.innerHTML = this.queue
      .map(
        (item) => `
      <div class="queue-item" data-id="${item.id}">
        <div class="queue-item-info">
          <div class="queue-item-name">${this.escapeHtml(item.name)}</div>
          <div class="queue-item-status status-${item.status}">${this.getStatusText(item.status)}</div>
          ${
            item.status === 'processing'
              ? `
            <div class="progress-container">
              <div class="progress-header">
                <span class="progress-step-name">${this.getStepDisplayName(item.currentStep)}</span>
                <span class="progress-percentage">${Math.round(item.progress)}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${item.progress}%"></div>
                <div class="progress-shine"></div>
              </div>
              ${
                item.stepMessage
                  ? `<div class="progress-message">${this.escapeHtml(item.stepMessage)}</div>`
                  : ''
              }
            </div>
          `
              : ''
          }
          ${
            item.status === 'error' || item.status === 'completed'
              ? `
            <div class="queue-item-actions">
              ${
                item.status === 'error'
                  ? `<button class="retry-btn" data-item-id="${item.id}" title="Retry processing">🔄 Retry</button>`
                  : ''
              }
              <button class="remove-btn" data-item-id="${item.id}" title="Remove from queue">×</button>
            </div>
          `
              : ''
          }
        </div>
      </div>
    `
      )
      .join('')

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

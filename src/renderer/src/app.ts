import { fileHandler } from './file-handler'
import { configManager } from './config'
import { resultsManager } from './results'
import { errorHandler } from './error-handler'
import type { QueueItem } from './file-handler'

export class App {
  private isProcessing = false
  private currentProcessingItem: QueueItem | null = null
  private partialResults: any = null

  constructor() {
    this.setupEventListeners()
    this.setupProgressListener()
  }

  private setupEventListeners(): void {
    setInterval(() => {
      const queue = fileHandler.getQueue()
      const pendingItems = queue.filter((item) => item.status === 'pending')
      if (pendingItems.length > 0 && !this.isProcessing) {
        this.processNextFile()
      }
    }, 1000)

    document.getElementById('cancelBtn')?.addEventListener('click', () => {
      this.cancelProcessing()
    })

    document.addEventListener('view-result', (e: Event) => {
      const { result, name } = (e as CustomEvent).detail
      resultsManager.displayResults(result, name)
    })
  }

  private setupProgressListener(): void {
    ;(window as any).electronAPI.onProcessingProgress((_event: any, progress: any) => {
      if (this.currentProcessingItem && progress) {
        if (progress.step === 'partial-result' && progress.type === 'transcription') {
          this.partialResults = progress.result
          resultsManager.displayResults(progress.result)
          this.updateStatus('Transcription ready - continuing...', 'success')
          return
        }

        const progressPercent =
          progress.overallProgress !== undefined ? progress.overallProgress : progress.progress || 0

        fileHandler.updateItemStatus(
          this.currentProcessingItem.id,
          'processing',
          progressPercent,
          progress.step || 'processing',
          progress.message || 'Processing...'
        )

        const stepName = this.getStepDisplayName(progress.step)
        this.updateStatus(`${stepName}: ${progress.message || ''}`, 'processing')
      }
    })
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

  async processNextFile(): Promise<void> {
    const queue = fileHandler.getQueue()
    const pendingItem = queue.find((item) => item.status === 'pending')

    if (!pendingItem || this.isProcessing) return

    this.isProcessing = true
    this.currentProcessingItem = pendingItem
    this.partialResults = null
    fileHandler.updateItemStatus(pendingItem.id, 'processing', 0)
    this.updateStatus('Processing...', 'processing')
    this.showCancelButton(true)

    try {
      const config = configManager.getConfig()
      const result = await (window as any).electronAPI.processAudio(pendingItem.path, config)

      if (result.success) {
        fileHandler.updateItemResult(pendingItem.id, result.result)
        fileHandler.updateItemStatus(pendingItem.id, 'completed', 100)
        resultsManager.displayResults(result.result, pendingItem.name)
        this.updateStatus('Analysis complete', 'success')
      } else {
        fileHandler.updateItemStatus(pendingItem.id, 'error', 0)
        errorHandler.showError({ message: result.message || 'Unknown error' })
        this.updateStatus(`Neural glitch: ${result.message}`, 'error')
      }
    } catch (error: any) {
      fileHandler.updateItemStatus(pendingItem.id, 'error', 0)
      errorHandler.showError(error)
      this.updateStatus(`Neural glitch: ${error.message}`, 'error')
    } finally {
      this.isProcessing = false
      this.currentProcessingItem = null
      this.showCancelButton(false)
    }
  }

  private showCancelButton(show: boolean): void {
    const btn = document.getElementById('cancelBtn')
    if (btn) btn.style.display = show ? 'flex' : 'none'
  }

  async cancelProcessing(): Promise<void> {
    if (this.isProcessing) {
      try {
        await (window as any).electronAPI.cancelProcessing()
        this.updateStatus('Cancelling...', 'warning')
      } catch (error) {
        console.error('Failed to cancel:', error)
      }
    }
  }

  updateStatus(message: string, type = 'info'): void {
    const pill = document.getElementById('statusBar')
    if (pill) {
      pill.className = `status-pill ${type}`
      const textEl = pill.querySelector('.status-text')
      if (textEl) textEl.textContent = message
    }
  }
}

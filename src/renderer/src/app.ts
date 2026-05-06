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
    
    const heroSection = document.getElementById('heroSection')
    heroSection?.classList.add('hero-active')
    
    this.updateStatus('Neural engines warming up...', 'processing')
    this.showCancelButton(true)

    try {
      const config = configManager.getConfig()
      const result = await (window as any).electronAPI.processAudio(pendingItem.path, config)

      if (result.success) {
        fileHandler.updateItemStatus(pendingItem.id, 'completed', 100)
        resultsManager.displayResults(result.result)
        this.updateStatus('Insight generation successful', 'success')
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
      heroSection?.classList.remove('hero-active')
      this.showCancelButton(false)
    }
  }

  private showCancelButton(show: boolean): void {
    const btn = document.getElementById('cancelBtn')
    if (btn) btn.style.display = show ? 'inline-block' : 'none'
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
    const statusBar = document.getElementById('statusBar')
    if (statusBar) {
      statusBar.textContent = message
      statusBar.className = `status-bar ${type}`
    }
  }
}

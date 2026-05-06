export interface ParsedError {
  type: string
  title: string
  message: string
  details: string
  actions: {
    label: string
    action: () => any
  }[]
}

export class ErrorHandler {
  private errors: ParsedError[] = []

  constructor() {
    this.setupErrorModal()
  }

  setupErrorModal(): void {
    if (!document.getElementById('errorModal')) {
      const modal = document.createElement('div')
      modal.id = 'errorModal'
      modal.className = 'error-modal'
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
      `
      document.body.appendChild(modal)

      document.getElementById('errorModalClose')?.addEventListener('click', () => {
        this.hideError()
      })
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideError()
        }
      })
    }
  }

  parseError(error: any): ParsedError {
    const errorMessage = error.message || error.toString()
    const errorDetails = error.details || errorMessage
    const errorString = errorMessage.toLowerCase()

    if (
      errorString.includes('binary') ||
      errorString.includes('whisper') ||
      errorString.includes('ffmpeg')
    ) {
      return {
        type: 'missing_binary',
        title: 'Missing Required Software',
        message: 'A required component is missing or not found.',
        details: errorDetails,
        actions: [
          {
            label: 'Run Setup',
            action: () => {
              window.location.href = 'setup.html'
            }
          },
          {
            label: 'Check Installation',
            action: () => {
              this.showInstallationInstructions(errorMessage)
            }
          }
        ]
      }
    }

    if (
      errorString.includes('api key') ||
      errorString.includes('gemini') ||
      errorString.includes('authentication')
    ) {
      return {
        type: 'api_error',
        title: 'API Configuration Error',
        message: 'There was an issue with the AI analysis API.',
        details: errorDetails,
        actions: [
          {
            label: 'Configure API Key',
            action: () => {
              document.getElementById('configToggle')?.click()
              document.getElementById('apiKey')?.focus()
            }
          },
          {
            label: 'Continue Without Analysis',
            action: () => 'skip_analysis'
          }
        ]
      }
    }

    return {
      type: 'generic',
      title: 'Processing Error',
      message: 'An unexpected error occurred during processing.',
      details: errorMessage,
      actions: [
        {
          label: 'Retry',
          action: () => 'retry'
        },
        {
          label: 'Report Issue',
          action: () => {
            this.copyErrorToClipboard(errorMessage)
            alert('Error details copied to clipboard.')
          }
        }
      ]
    }
  }

  showError(error: any): ParsedError {
    const parsed = this.parseError(error)
    this.errors.push(parsed)

    const modal = document.getElementById('errorModal')
    const messageEl = document.getElementById('errorMessage')
    const detailsEl = document.getElementById('errorDetails')
    const actionsEl = document.getElementById('errorActions')

    if (modal && messageEl && detailsEl && actionsEl) {
      messageEl.innerHTML = `<strong>${parsed.title}</strong><p>${parsed.message}</p>`
      detailsEl.innerHTML = `<details><summary>Error Details</summary><pre>${this.escapeHtml(
        parsed.details
      )}</pre></details>`

      actionsEl.innerHTML = parsed.actions
        .map(
          (action, index) =>
            `<button class="error-action-btn" data-action-index="${index}">${action.label}</button>`
        )
        .join('')

      actionsEl.querySelectorAll('.error-action-btn').forEach((btn, index) => {
        btn.addEventListener('click', () => {
          const result = parsed.actions[index].action()
          if (result === 'retry' || result === 'skip_analysis') {
            this.hideError()
          }
        })
      })

      modal.style.display = 'flex'
    }
    return parsed
  }

  hideError(): void {
    const modal = document.getElementById('errorModal')
    if (modal) {
      modal.style.display = 'none'
    }
  }

  private showInstallationInstructions(errorMessage: string): void {
    alert(`Binary missing. Please run setup. Error: ${errorMessage}`)
  }

  private copyErrorToClipboard(text: string): void {
    navigator.clipboard.writeText(text).catch(() => {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    })
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  showErrorBanner(errors: any[]): void {
    const banner = document.createElement('div')
    banner.className = 'error-banner'
    banner.innerHTML = `
      <div class="error-banner-content">
        <span>⚠️ Some steps failed:</span>
        <ul>
          ${errors.map((e) => `<li>${e.step}: ${e.error}</li>`).join('')}
        </ul>
        <button class="error-banner-close">×</button>
      </div>
    `
    banner.querySelector('.error-banner-close')?.addEventListener('click', () => banner.remove())

    const resultsSection = document.getElementById('resultsSection')
    if (resultsSection) {
      resultsSection.insertBefore(banner, resultsSection.firstChild)
    }
  }
}

export const errorHandler = new ErrorHandler()

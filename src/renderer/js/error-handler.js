class ErrorHandler {
  constructor() {
    this.errors = [];
    this.setupErrorModal();
  }

  setupErrorModal() {
    // Create error modal if it doesn't exist
    if (!document.getElementById('errorModal')) {
      const modal = document.createElement('div');
      modal.id = 'errorModal';
      modal.className = 'error-modal';
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

      // Close modal handlers
      document.getElementById('errorModalClose').addEventListener('click', () => {
        this.hideError();
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideError();
        }
      });
    }
  }

  /**
   * Parse error and provide actionable steps
   */
  parseError(error, context = {}) {
    const errorMessage = error.message || error.toString();
    const errorDetails = error.details || errorMessage;
    const errorString = errorMessage.toLowerCase();

    // Categorize errors
    if (errorString.includes('binary') || errorString.includes('whisper') || errorString.includes('ffmpeg')) {
      return {
        type: 'missing_binary',
        title: 'Missing Required Software',
        message: 'A required component is missing or not found.',
        details: errorDetails,
        actions: [
          {
            label: 'Run Setup',
            action: () => {
              window.location.href = 'setup.html';
            }
          },
          {
            label: 'Check Installation',
            action: () => {
              this.showInstallationInstructions(errorMessage);
            }
          }
        ]
      };
    }

    if (errorString.includes('api key') || errorString.includes('gemini') || errorString.includes('authentication')) {
      return {
        type: 'api_error',
        title: 'API Configuration Error',
        message: 'There was an issue with the AI analysis API.',
        details: errorDetails,
        actions: [
          {
            label: 'Configure API Key',
            action: () => {
              document.getElementById('configToggle').click();
              document.getElementById('apiKey').focus();
            }
          },
          {
            label: 'Continue Without Analysis',
            action: () => {
              // This will be handled by the caller
              return 'skip_analysis';
            }
          }
        ]
      };
    }

    if (errorString.includes('model') || errorString.includes('download')) {
      return {
        type: 'model_error',
        title: 'Model Download Error',
        message: 'Failed to download or access the AI model.',
        details: errorDetails,
        actions: [
          {
            label: 'Retry Download',
            action: () => {
              window.location.href = 'setup.html';
            }
          },
          {
            label: 'Check Internet Connection',
            action: () => {
              alert('Please check your internet connection and try again.');
            }
          }
        ]
      };
    }

    if (errorString.includes('permission') || errorString.includes('access') || errorString.includes('denied')) {
      return {
        type: 'permission_error',
        title: 'Permission Denied',
        message: 'The application does not have permission to access this file or location.',
        details: errorDetails,
        actions: [
          {
            label: 'Select Different File',
            action: () => {
              // Will be handled by caller
              return 'retry_file';
            }
          },
          {
            label: 'Check File Permissions',
            action: () => {
              alert('Please ensure the file is not open in another application and you have read permissions.');
            }
          }
        ]
      };
    }

    if (errorString.includes('format') || errorString.includes('invalid') || errorString.includes('corrupt')) {
      return {
        type: 'format_error',
        title: 'Invalid File Format',
        message: 'The file format is not supported or the file may be corrupted.',
        details: errorDetails,
        actions: [
          {
            label: 'Try Different File',
            action: () => {
              return 'retry_file';
            }
          },
          {
            label: 'Convert File Format',
            action: () => {
              alert('Please convert your audio file to WAV, MP3, M4A, AAC, FLAC, or OGG format.');
            }
          }
        ]
      };
    }

    // Generic error
    return {
      type: 'generic',
      title: 'Processing Error',
      message: 'An unexpected error occurred during processing.',
      details: errorMessage,
      actions: [
        {
          label: 'Retry',
          action: () => {
            return 'retry';
          }
        },
        {
          label: 'Report Issue',
          action: () => {
            this.copyErrorToClipboard(errorMessage);
            alert('Error details copied to clipboard. Please report this issue with the error details.');
          }
        }
      ]
    };
  }

  showError(error, context = {}) {
    const parsed = this.parseError(error, context);
    this.errors.push({ ...parsed, timestamp: new Date() });

    const modal = document.getElementById('errorModal');
    const messageEl = document.getElementById('errorMessage');
    const detailsEl = document.getElementById('errorDetails');
    const actionsEl = document.getElementById('errorActions');

    messageEl.innerHTML = `<strong>${parsed.title}</strong><p>${parsed.message}</p>`;
    detailsEl.innerHTML = `<details><summary>Error Details</summary><pre>${this.escapeHtml(parsed.details)}</pre></details>`;
    
    actionsEl.innerHTML = parsed.actions.map((action, index) => 
      `<button class="error-action-btn" data-action-index="${index}">${action.label}</button>`
    ).join('');

    // Attach action handlers
    actionsEl.querySelectorAll('.error-action-btn').forEach((btn, index) => {
      btn.addEventListener('click', () => {
        const result = parsed.actions[index].action();
        if (result === 'retry' || result === 'retry_file' || result === 'skip_analysis') {
          this.hideError();
          return result;
        }
        // Other actions handle themselves
      });
    });

    modal.style.display = 'flex';
    return parsed;
  }

  hideError() {
    const modal = document.getElementById('errorModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  showInstallationInstructions(errorMessage) {
    const instructions = `
Missing Binary Installation Instructions:

1. Ensure binaries are in the correct location:
   - macOS: bin/darwin/whisper and bin/darwin/ffmpeg
   - Windows: bin/win32/whisper.exe and bin/win32/ffmpeg.exe

2. Run the setup process from the Setup screen

3. If binaries are missing, you may need to:
   - Build whisper.cpp from source
   - Download FFmpeg from official sources
   - Place them in the bin directory

Error: ${errorMessage}
    `;
    alert(instructions);
  }

  copyErrorToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show partial results even when errors occur
   */
  showPartialResults(result, errors) {
    if (!result) return;

    // Show what we have
    const hasTranscript = result.transcript && (
      typeof result.transcript === 'string' || 
      (result.transcript.text && result.transcript.text.trim())
    );
    const hasAnalysis = result.analysis;
    const hasDiarized = result.diarized;

    if (hasTranscript || hasAnalysis || hasDiarized) {
      // Show results with error warnings
      resultsManager.displayResults(result);
      
      // Show error banner
      this.showErrorBanner(errors);
    }
  }

  showErrorBanner(errors) {
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.innerHTML = `
      <div class="error-banner-content">
        <span>⚠️ Some steps failed, but partial results are available:</span>
        <ul>
          ${errors.map(e => `<li>${e.step}: ${e.error}</li>`).join('')}
        </ul>
        <button class="error-banner-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
      resultsSection.insertBefore(banner, resultsSection.firstChild);
    }
  }
}

const errorHandler = new ErrorHandler();
window.errorHandler = errorHandler;


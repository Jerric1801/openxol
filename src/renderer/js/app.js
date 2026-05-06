class App {
  constructor() {
    this.isProcessing = false;
    this.currentProcessingItem = null;
    this.partialResults = null; // Store partial results (transcription)
    this.setupEventListeners();
    this.setupProgressListener();
  }
  
  setupEventListeners() {
    // Process files when added to queue
    // Listen for file additions
    setInterval(() => {
      const queue = fileHandler.getQueue();
      const pendingItems = queue.filter(item => item.status === 'pending');
      
      if (pendingItems.length > 0 && !this.isProcessing) {
        this.processNextFile();
      }
    }, 1000);
    
    // Cancel button handler
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.cancelProcessing();
      });
    }
  }

  setupProgressListener() {
    // Listen for processing progress updates from main process
    window.electronAPI.onProcessingProgress((event, progress) => {
      if (this.currentProcessingItem && progress) {
        // Handle partial results (transcription ready)
        if (progress.step === 'partial-result' && progress.type === 'transcription') {
          this.partialResults = progress.result;
          // Show transcription immediately
          resultsManager.displayResults(progress.result);
          this.updateStatus('Transcription ready - continuing with additional processing...', 'success');
          return;
        }
        
        // Use overallProgress if available, otherwise fall back to progress
        const progressPercent = progress.overallProgress !== undefined 
          ? progress.overallProgress 
          : (progress.progress || 0);
        
        fileHandler.updateItemStatus(
          this.currentProcessingItem.id, 
          'processing', 
          progressPercent,
          progress.step || 'processing',
          progress.message || 'Processing...'
        );
        
        // Update status bar with step information
        const stepName = this.getStepDisplayName(progress.step);
        const statusMessage = progress.message 
          ? `${stepName}: ${progress.message}` 
          : stepName;
        this.updateStatus(statusMessage, 'processing');
      }
    });
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

  async processNextFile() {
    const queue = fileHandler.getQueue();
    const pendingItem = queue.find(item => item.status === 'pending');
    
    if (!pendingItem || this.isProcessing) return;

    this.isProcessing = true;
    this.currentProcessingItem = pendingItem;
    this.partialResults = null; // Reset partial results
    fileHandler.updateItemStatus(pendingItem.id, 'processing', 0);
    this.updateStatus('Starting processing...', 'processing');
    this.showCancelButton(true);

    try {
      const config = configManager.getConfig();
      const result = await window.electronAPI.processAudio(pendingItem.path, config);
      
      if (result.success) {
        const hasCriticalError = result.result?.errors?.some(e => e.critical);
        const hasTranscript = result.result?.transcript && 
          !result.result.errors?.some(e => e.step === 'transcription' && e.critical);
        
        if (hasCriticalError && !hasTranscript) {
          // Transcription failed - show error, no results
          fileHandler.updateItemStatus(pendingItem.id, 'error', 0);
          const criticalError = result.result.errors.find(e => e.critical);
          this.updateStatus(`Transcription failed: ${criticalError.error}`, 'error');
          errorHandler.showError({ 
            message: 'Transcription failed. Please check your setup and try again.',
            details: criticalError.error
          }, { filePath: pendingItem.path, itemId: pendingItem.id });
        } else {
          // Show results (transcript available, even if other steps failed)
          // Merge partial results if available (transcription was shown early)
          const finalResult = this.partialResults ? {
            ...result.result,
            transcript: result.result.transcript || this.partialResults.transcript
          } : result.result;
          
          fileHandler.updateItemStatus(pendingItem.id, 'completed', 100);
          resultsManager.displayResults(finalResult);
          
          if (result.result.errors && result.result.errors.length > 0) {
            this.updateStatus('Processing completed with warnings - Results available below', 'warning');
          } else {
            this.updateStatus('Processing completed successfully', 'success');
          }
        }
      } else {
        // Handle error with actionable steps (fallback for unexpected errors)
        fileHandler.updateItemStatus(pendingItem.id, 'error', 0);
        const errorResult = errorHandler.showError(
          { message: result.error },
          { filePath: pendingItem.path, itemId: pendingItem.id }
        );
        
        // Check if user wants to retry
        const retryAction = errorResult.actions.find(a => 
          a.label === 'Retry' || a.label === 'Try Different File'
        );
        
        if (retryAction) {
          this.updateStatus(`Error: ${result.error} - Click retry to try again`, 'error');
        } else {
          this.updateStatus(`Error: ${result.error}`, 'error');
        }
      }
    } catch (error) {
      fileHandler.updateItemStatus(pendingItem.id, 'error', 0);
      
      // Show detailed error with recovery options
      errorHandler.showError(error, { 
        filePath: pendingItem.path, 
        itemId: pendingItem.id 
      });
      
      // Check if error is due to cancellation
      if (error.message && error.message.includes('cancelled')) {
        fileHandler.updateItemStatus(pendingItem.id, 'cancelled', 0);
        this.updateStatus('Processing cancelled', 'warning');
        
        // Show partial results if available (transcription)
        if (this.partialResults) {
          resultsManager.displayResults(this.partialResults);
          this.updateStatus('Processing cancelled - Transcription available below', 'warning');
        }
      } else {
        fileHandler.updateItemStatus(pendingItem.id, 'error', 0);
        
        // Show detailed error with recovery options
        errorHandler.showError(error, { 
          filePath: pendingItem.path, 
          itemId: pendingItem.id 
        });
        
        this.updateStatus(`Error: ${error.message}`, 'error');
      }
    } finally {
      this.isProcessing = false;
      this.currentProcessingItem = null;
      this.showCancelButton(false);
    }
  }
  
  showCancelButton(show) {
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
      cancelBtn.style.display = show ? 'inline-block' : 'none';
    }
  }
  
  async cancelProcessing() {
    if (this.isProcessing) {
      try {
        const result = await window.electronAPI.cancelProcessing();
        if (result.success) {
          this.updateStatus('Cancelling...', 'warning');
          // Don't set isProcessing to false yet - wait for final result or error
        }
      } catch (error) {
        console.error('Failed to cancel processing:', error);
      }
    }
  }

  async retryProcessing(itemId) {
    const queue = fileHandler.getQueue();
    const item = queue.find(q => q.id === itemId);
    if (item) {
      item.status = 'pending';
      item.progress = 0;
      fileHandler.updateQueueDisplay();
      // Will be picked up by the interval
    }
  }

  updateStatus(message, type = 'info') {
    const statusBar = document.getElementById('statusBar');
    if (statusBar) {
      statusBar.textContent = message;
      statusBar.className = `status-bar ${type}`;
    }
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  window.app = app;
});


class ResultsManager {
  constructor() {
    this.currentResult = null;
    this.setupTabs();
  }

  setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        this.switchTab(tabName);
      });
    });
  }

  switchTab(tabName) {
    // Update button states
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update content visibility
    document.querySelectorAll('.tab-content').forEach(content => {
      content.style.display = 'none';
    });
    document.getElementById(`${tabName}Tab`).style.display = 'block';

    // Load tab content if needed
    if (tabName === 'downloads') {
      this.updateDownloadsTab();
    }
  }

  displayResults(result) {
    if (!result) {
      console.warn('displayResults called with no result');
      return;
    }

    this.currentResult = result;
    const resultsSection = document.getElementById('resultsSection');
    if (!resultsSection) {
      console.error('Results section not found in DOM');
      return;
    }
    
    // Always show results section - force display
    resultsSection.style.display = 'block';
    resultsSection.style.visibility = 'visible';
    
    // Ensure transcript tab is active by default
    this.switchTab('transcript');
    
    // Show workflow status and errors/warnings if any
    this.displayWorkflowStatus(result);
    if (result.errors && result.errors.length > 0) {
      this.displayErrors(result.errors);
    }
    
    // Display transcript - safely extract text from object
    let transcriptText = '';
    if (result.diarized) {
      transcriptText = typeof result.diarized === 'string' 
        ? result.diarized 
        : (result.diarized.text || '');
    }
    if (!transcriptText && result.transcript) {
      transcriptText = typeof result.transcript === 'string' 
        ? result.transcript 
        : (result.transcript.text || '');
    }
    if (!transcriptText) {
      transcriptText = result.errors && result.errors.length > 0
        ? 'No transcript available. Check errors above for details.'
        : 'No transcript available.';
    }
    
    const transcriptContent = document.getElementById('transcriptContent');
    if (transcriptContent) {
      transcriptContent.textContent = transcriptText;
    } else {
      console.error('Transcript content element not found');
    }

    // Display analysis (even if null/undefined - displayAnalysis handles it)
    this.displayAnalysis(result.analysis);

    // Update downloads tab to reflect available results
    this.updateDownloadsTab();

    // Scroll to results after a brief delay to ensure DOM is ready
    setTimeout(() => {
      try {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        // Fallback if scrollIntoView fails
        window.scrollTo({ top: resultsSection.offsetTop, behavior: 'smooth' });
      }
    }, 150);
  }

  displayWorkflowStatus(result) {
    const steps = [
      { name: 'Transcription', key: 'transcript', critical: true },
      { name: 'Diarization', key: 'diarized', critical: false },
      { name: 'AI Analysis', key: 'analysis', critical: false },
      { name: 'Document Generation', key: 'docxPath', critical: false }
    ];
    
    const statusContainer = document.createElement('div');
    statusContainer.className = 'workflow-status';
    
    const statusItems = steps.map(step => {
      const hasResult = result[step.key] && (
        typeof result[step.key] === 'string' || 
        (typeof result[step.key] === 'object' && (result[step.key].text || result[step.key].length > 0))
      );
      
      // Map step names to error step identifiers
      const stepErrorMap = {
        'Transcription': 'transcription',
        'Diarization': 'diarization',
        'AI Analysis': 'analysis',
        'Document Generation': 'docx'
      };
      
      const errorStepKey = stepErrorMap[step.name];
      const hasError = result.errors?.some(e => e.step === errorStepKey);
      const error = result.errors?.find(e => e.step === errorStepKey);
      const isCritical = error?.critical || false;
      
      let statusIcon = '⏳';
      let statusClass = 'pending';
      let statusText = 'Not started';
      
      if (hasError) {
        if (isCritical) {
          statusIcon = '❌';
          statusClass = 'error-critical';
          statusText = 'Failed (Critical)';
        } else {
          statusIcon = '⚠️';
          statusClass = 'error-warning';
          statusText = 'Failed (Non-critical)';
        }
      } else if (hasResult) {
        statusIcon = '✅';
        statusClass = 'success';
        statusText = 'Completed';
      }
      
      return `
        <div class="workflow-step ${statusClass}">
          <span class="workflow-step-icon">${statusIcon}</span>
          <span class="workflow-step-name">${step.name}</span>
          <span class="workflow-step-status">${statusText}</span>
        </div>
      `;
    }).join('');
    
    statusContainer.innerHTML = `
      <h3>Processing Status</h3>
      <div class="workflow-steps">
        ${statusItems}
      </div>
    `;
    
    const resultsSection = document.getElementById('resultsSection');
    const existingStatus = resultsSection.querySelector('.workflow-status');
    if (existingStatus) {
      existingStatus.remove();
    }
    resultsSection.insertBefore(statusContainer, resultsSection.querySelector('h2').nextSibling);
  }

  displayErrors(errors) {
    // Separate critical and non-critical errors
    const criticalErrors = errors.filter(e => e.critical);
    const nonCriticalErrors = errors.filter(e => !e.critical);
    
    const errorsContainer = document.createElement('div');
    errorsContainer.className = 'results-errors';
    
    let errorContent = '';
    
    if (criticalErrors.length > 0) {
      errorContent += `
        <div class="error-section critical">
          <h3>❌ Critical Errors</h3>
          <ul class="error-list">
            ${criticalErrors.map(e => `
              <li>
                <strong>${e.step}:</strong> ${this.escapeHtml(e.error)}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }
    
    if (nonCriticalErrors.length > 0) {
      errorContent += `
        <div class="error-section warning">
          <h3>⚠️ Processing Warnings</h3>
          <ul class="error-list">
            ${nonCriticalErrors.map(e => `
              <li>
                <strong>${e.step}:</strong> ${this.escapeHtml(e.error)}
              </li>
            `).join('')}
          </ul>
          <p class="error-note">Some optional steps failed, but available results are shown below.</p>
        </div>
      `;
    }
    
    errorsContainer.innerHTML = errorContent;
    
    const resultsSection = document.getElementById('resultsSection');
    const existingErrors = resultsSection.querySelector('.results-errors');
    if (existingErrors) {
      existingErrors.remove();
    }
    
    // Insert after workflow status if it exists, otherwise after h2
    const workflowStatus = resultsSection.querySelector('.workflow-status');
    if (workflowStatus) {
      workflowStatus.insertAdjacentElement('afterend', errorsContainer);
    } else {
      resultsSection.insertBefore(errorsContainer, resultsSection.querySelector('h2').nextSibling);
    }
  }

  displayAnalysis(analysis) {
    const analysisContent = document.getElementById('analysisContent');
    if (!analysisContent) {
      console.error('Analysis content element not found');
      return;
    }
    
    if (!analysis) {
      // Check if analysis failed with an error or was skipped gracefully
      const hasAnalysisError = this.currentResult?.errors?.some(e => e.step === 'analysis');
      
      const message = hasAnalysisError
        ? 'Analysis failed. Check errors above for details.'
        : 'Analysis was skipped because no transcript text was available.';
      
      analysisContent.innerHTML = `<p class="no-content">${message}</p>`;
      return;
    }

    const sections = [
      { title: 'Meeting Synthesis', content: analysis.synthesis || analysis.raw || '' },
      { title: 'Action Items', content: analysis.actionItems || '' },
      { title: 'Critique & Analysis', content: analysis.critique || '' },
      { title: 'Key Insights', content: analysis.insights || '' }
    ];

    analysisContent.innerHTML = sections.map(section => `
      <div class="analysis-section">
        <h3>${section.title}</h3>
        <div>${this.formatText(section.content)}</div>
      </div>
    `).join('');
  }

  formatText(text) {
    if (!text) return '<p>No content available</p>';
    // Convert newlines to paragraphs
    return text.split('\n').filter(line => line.trim()).map(line => 
      `<p>${this.escapeHtml(line.trim())}</p>`
    ).join('');
  }

  updateDownloadsTab() {
    const downloadsContent = document.getElementById('downloadsContent');
    if (!downloadsContent) {
      console.error('Downloads content element not found');
      return;
    }
    
    if (!this.currentResult) {
      downloadsContent.innerHTML = '<p class="no-content">No results available for download</p>';
      return;
    }

    const downloads = [];
    
    if (this.currentResult.transcript) {
      downloads.push({
        name: 'Transcript (TXT)',
        action: () => this.downloadTranscript()
      });
    }

    if (this.currentResult.analysis) {
      downloads.push({
        name: 'Analysis (TXT)',
        action: () => this.downloadAnalysis()
      });
    }

    if (this.currentResult.docxPath) {
      downloads.push({
        name: 'Full Report (DOCX)',
        action: () => this.downloadDocx()
      });
    }

    downloadsContent.innerHTML = downloads.map(download => `
      <a href="#" class="download-button" data-action="${download.name}">${download.name}</a>
    `).join('');

    // Attach event listeners
    downloadsContent.querySelectorAll('.download-button').forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const action = downloads.find(d => d.name === button.dataset.action);
        if (action) action.action();
      });
    });
  }

  downloadTranscript() {
    // Safely extract text from transcript object
    let text = '';
    if (this.currentResult.diarized) {
      text = typeof this.currentResult.diarized === 'string' 
        ? this.currentResult.diarized 
        : (this.currentResult.diarized.text || '');
    }
    if (!text && this.currentResult.transcript) {
      text = typeof this.currentResult.transcript === 'string' 
        ? this.currentResult.transcript 
        : (this.currentResult.transcript.text || '');
    }
    this.downloadText(text, 'transcript.txt');
  }

  downloadAnalysis() {
    const analysis = this.currentResult.analysis;
    if (!analysis) return;
    
    const text = `
Meeting Analysis Report
======================

MEETING SYNTHESIS
${analysis.synthesis || analysis.raw || ''}

ACTION ITEMS
${analysis.actionItems || ''}

CRITIQUE & ANALYSIS
${analysis.critique || ''}

KEY INSIGHTS
${analysis.insights || ''}
    `.trim();
    
    this.downloadText(text, 'analysis.txt');
  }

  downloadDocx() {
    if (window.app) {
      window.app.updateStatus(`Report saved to: ${this.currentResult.docxPath}`, 'success');
    }
  }

  downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const resultsManager = new ResultsManager();





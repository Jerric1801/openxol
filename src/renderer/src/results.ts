import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { PipelineResult, PipelineError } from '../../types/pipeline'

marked.setOptions({ gfm: true, breaks: true })

// Sanitize Gemini-generated HTML to prevent prompt-injection XSS
const sanitize = (html: string): string =>
  DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })

export class ResultsManager {
  private currentResult: PipelineResult | null = null

  constructor() {
    this.setupTabs()
  }

  setupTabs(): void {
    const tabButtons = document.querySelectorAll('.tab-button')
    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const tabName = (button as HTMLElement).dataset.tab
        if (tabName) this.switchTab(tabName)
      })
    })

    document.getElementById('closeResults')?.addEventListener('click', () => {
      document.querySelector('.app-body')?.classList.remove('has-results')
      const resultsSection = document.getElementById('resultsSection')
      if (resultsSection) resultsSection.style.display = 'none'
    })
  }

  switchTab(tabName: string): void {
    document.querySelectorAll('.tab-button').forEach((btn) => {
      btn.classList.remove('active')
    })
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active')

    document.querySelectorAll('.tab-content').forEach((content) => {
      ;(content as HTMLElement).style.display = 'none'
    })
    const tabEl = document.getElementById(`${tabName}Tab`)
    if (tabEl) tabEl.style.display = 'block'

    if (tabName === 'downloads') {
      this.updateDownloadsTab()
    }
  }

  displayResults(result: PipelineResult, filename = ''): void {
    if (!result) return

    this.currentResult = result
    const resultsSection = document.getElementById('resultsSection')
    if (!resultsSection) return

    resultsSection.style.display = 'flex'
    resultsSection.style.flexDirection = 'column'
    document.querySelector('.app-body')?.classList.add('has-results')
    this.switchTab('transcript')

    const filenameEl = document.getElementById('resultsFilename')
    if (filenameEl) filenameEl.textContent = filename

    this.displayWorkflowStatus(result)
    if (result.errors && result.errors.length > 0) {
      this.displayErrors(result.errors)
    }

    const transcriptText = result.diarized?.text || result.transcript?.text || 'No transcript available.'
    const transcriptContent = document.getElementById('transcriptContent')
    if (transcriptContent) {
      transcriptContent.textContent = transcriptText
    }

    this.displayAnalysis(result.analysis)
    this.updateDownloadsTab()
  }

  private displayWorkflowStatus(result: PipelineResult): void {
    const steps = [
      { name: 'Transcription', key: 'transcript', errorKey: 'transcription' },
      { name: 'Diarization', key: 'diarized', errorKey: 'diarization' },
      { name: 'AI Analysis', key: 'analysis', errorKey: 'analysis' },
      { name: 'Document Generation', key: 'docxPath', errorKey: 'docx' }
    ]

    const statusContainer = document.createElement('div')
    statusContainer.className = 'workflow-status'

    const statusItems = steps
      .map((step) => {
        const hasResult = !!(result as any)[step.key]
        const error = result.errors?.find((e) => e.step === step.errorKey)

        let cls = 'pending',
          txt = 'Pending'
        if (error) {
          cls = error.critical ? 'error-critical' : 'error-warning'
          txt = error.critical ? 'Failed' : 'Warning'
        } else if (hasResult) {
          cls = 'success'
          txt = 'Complete'
        }

        return `
        <div class="workflow-step ${cls}">
          <div class="workflow-step-row">
            <span class="workflow-step-dot"></span>
            <span class="workflow-step-name">${step.name}</span>
          </div>
          <span class="workflow-step-status">${txt}</span>
        </div>
      `
      })
      .join('')

    statusContainer.innerHTML = `<h3>Processing Status</h3><div class="workflow-steps">${statusItems}</div>`

    const resultsSection = document.getElementById('resultsSection')
    resultsSection?.querySelector('.workflow-status')?.remove()
    const resultsHeader = resultsSection?.querySelector('.results-header')
    resultsSection?.insertBefore(statusContainer, resultsHeader?.nextSibling || null)
  }

  private displayErrors(errors: PipelineError[]): void {
    const errorsContainer = document.createElement('div')
    errorsContainer.className = 'results-errors'

    const critical = errors.filter((e) => e.critical)
    const nonCritical = errors.filter((e) => !e.critical)

    let content = ''
    if (critical.length > 0) {
      content += `
        <div class="error-section critical">
          <h3>❌ Critical Errors</h3>
          <ul class="error-list">
            ${critical.map((e) => `<li><strong>${e.step}:</strong> ${this.escapeHtml(e.error)}</li>`).join('')}
          </ul>
        </div>
      `
    }
    if (nonCritical.length > 0) {
      content += `
        <div class="error-section warning">
          <h3>⚠️ Warnings</h3>
          <ul class="error-list">
            ${nonCritical.map((e) => `<li><strong>${e.step}:</strong> ${this.escapeHtml(e.error)}</li>`).join('')}
          </ul>
        </div>
      `
    }

    errorsContainer.innerHTML = content
    const resultsSection = document.getElementById('resultsSection')
    resultsSection?.querySelector('.results-errors')?.remove()
    resultsSection?.querySelector('.workflow-status')?.insertAdjacentElement('afterend', errorsContainer)
  }

  private displayAnalysis(analysis: any): void {
    const analysisContent = document.getElementById('analysisContent')
    if (!analysisContent) return

    if (!analysis) {
      analysisContent.innerHTML = `<p class="no-content">No analysis available.</p>`
      return
    }

    const sections = [
      { key: 'executiveSummary', title: 'Executive Summary', content: analysis.executiveSummary || '' },
      { key: 'keyDecisions',     title: 'Key Decisions',     content: analysis.keyDecisions     || '' },
      { key: 'actionItems',      title: 'Action Items',      content: analysis.actionItems      || '' },
      { key: 'keyThemes',        title: 'Key Themes',        content: analysis.keyThemes        || '' }
    ]

    analysisContent.innerHTML = sections
      .map(
        (section) => `
      <div class="analysis-section" data-section="${section.key}">
        <div class="analysis-section-header">
          <h3>${section.title}</h3>
          <button class="btn-copy-section" data-section="${section.key}" title="Copy to clipboard">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>Copy</span>
          </button>
        </div>
        <div class="analysis-section-body md-body">${section.content ? sanitize(marked.parse(section.content) as string) : '<p class="no-content">No content</p>'}</div>
        <div class="analysis-section-raw" hidden>${this.escapeHtml(section.content)}</div>
      </div>
    `
      )
      .join('')

    // Wire copy buttons after innerHTML is set
    analysisContent.querySelectorAll('.btn-copy-section').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sectionEl = (btn as HTMLElement).closest('.analysis-section')
        const raw = sectionEl?.querySelector('.analysis-section-raw')?.textContent || ''
        navigator.clipboard.writeText(raw).then(() => {
          const label = btn.querySelector('span')
          if (label) {
            label.textContent = 'Copied!'
            setTimeout(() => { label.textContent = 'Copy' }, 1800)
          }
        })
      })
    })
  }

  updateDownloadsTab(): void {
    const downloadsContent = document.getElementById('downloadsContent')
    if (!downloadsContent || !this.currentResult) return

    const downloads = []
    if (this.currentResult.transcript) {
      downloads.push({ name: 'Transcript (TXT)', action: () => this.downloadTranscript() })
    }
    if (this.currentResult.analysis) {
      downloads.push({ name: 'Analysis (TXT)', action: () => this.downloadAnalysis() })
    }
    if (this.currentResult.docxPath) {
      downloads.push({ name: 'Full Report (DOCX)', action: () => {} })
    }

    downloadsContent.innerHTML = downloads
      .map((d) => `<a href="#" class="download-button" data-action="${d.name}">${d.name}</a>`)
      .join('')

    downloadsContent.querySelectorAll('.download-button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        const action = downloads.find((d) => d.name === (btn as HTMLElement).dataset.action)
        if (action) action.action()
      })
    })
  }

  private downloadTranscript(): void {
    const text =
      this.currentResult?.diarized?.text ||
      this.currentResult?.transcript?.text ||
      'No transcript available.'
    this.downloadText(text, 'transcript.txt')
  }

  private downloadAnalysis(): void {
    const a = this.currentResult?.analysis
    if (!a) return
    const text = `Executive Summary:\n${a.executiveSummary}\n\nKey Decisions:\n${a.keyDecisions}\n\nAction Items:\n${a.actionItems}\n\nKey Themes:\n${a.keyThemes}`
    this.downloadText(text, 'analysis.txt')
  }

  private downloadText(text: string, filename: string): void {
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

export const resultsManager = new ResultsManager()

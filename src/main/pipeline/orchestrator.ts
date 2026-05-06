import path from 'path'
import os from 'os'
import log from 'electron-log'
import { TranscriptionModule } from './transcription'
import { DiarizationModule } from './diarization'
import { AnalysisModule } from './analysis'
import { DocxGenModule } from './docx-gen'
import { FileUtils } from '../utils/file-utils'
import type { Config } from '../../types/config'
import type { PipelineResult, ProgressUpdate } from '../../types/pipeline'

export class MeetingPipeline {
  private config: Config
  private transcription: TranscriptionModule
  private diarization: DiarizationModule
  private analysis: AnalysisModule
  private docxGen: DocxGenModule
  private isCancelled = false

  constructor(config: Config) {
    this.config = config
    this.transcription = new TranscriptionModule(config)
    this.diarization = new DiarizationModule(config)
    this.analysis = new AnalysisModule(config)
    this.docxGen = new DocxGenModule(config)
  }

  cancel(): void {
    this.isCancelled = true
    this.diarization.cancel()
    log.info('Pipeline cancellation requested')
  }

  async process(
    audioPath: string,
    onProgress: (update: ProgressUpdate) => void = () => {}
  ): Promise<PipelineResult> {
    log.info(`Starting pipeline for: ${audioPath}`)

    const results: PipelineResult = {
      audioPath,
      transcript: null,
      diarized: null,
      analysis: null,
      docxPath: null,
      errors: []
    }

    try {
      // STEP 1: Transcription
      onProgress({
        step: 'transcription',
        progress: 0,
        message: 'Starting transcription...'
      })

      results.transcript = await this.transcription.transcribe(audioPath)

      onProgress({
        step: 'transcription',
        progress: 25,
        message: 'Transcription completed',
        type: 'partial-result',
        result: { transcript: results.transcript }
      })

      // STEP 2: Diarization
      if (this.config.diarization.enabled && !this.isCancelled) {
        try {
          onProgress({
            step: 'diarization',
            progress: 25,
            message: 'Starting diarization...'
          })

          results.diarized = await this.diarization.diarize(audioPath, results.transcript)

          onProgress({
            step: 'diarization',
            progress: 50,
            message: 'Diarization completed'
          })
        } catch (error: any) {
          log.error('Diarization failed:', error)
          results.errors.push({ step: 'diarization', error: error.message, critical: false })
        }
      }

      // STEP 3: Analysis
      if (this.config.analysis.enabled && !this.isCancelled) {
        try {
          const transcriptToAnalyze = results.diarized?.text || results.transcript.text
          onProgress({
            step: 'analysis',
            progress: 50,
            message: 'Starting AI analysis...'
          })

          results.analysis = await this.analysis.analyze(transcriptToAnalyze)

          onProgress({
            step: 'analysis',
            progress: 75,
            message: 'Analysis completed'
          })
        } catch (error: any) {
          log.error('Analysis failed:', error)
          results.errors.push({ step: 'analysis', error: error.message, critical: false })
        }
      }

      // STEP 4: Document Generation
      if (this.config.document.enabled && !this.isCancelled) {
        try {
          onProgress({
            step: 'document',
            progress: 75,
            message: 'Generating report...'
          })

          const outputDir = this.config.output.directory || path.join(os.homedir(), 'Meeting Analysis')
          await FileUtils.ensureDirectoryExists(outputDir)

          const fileName = FileUtils.getFileNameWithoutExtension(audioPath)
          const timestamp = this.config.output.useTimestampedDirs
            ? new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
            : ''
          const outputPath = path.join(
            outputDir,
            timestamp ? `${timestamp}_${fileName}_report.docx` : `${fileName}_report.docx`
          )

          results.docxPath = await this.docxGen.generateReport(
            results.transcript,
            results.diarized,
            results.analysis,
            outputPath
          )

          onProgress({
            step: 'document',
            progress: 100,
            message: 'Report generated'
          })
        } catch (error: any) {
          log.error('DOCX generation failed:', error)
          results.errors.push({ step: 'docx', error: error.message, critical: false })
        }
      }

      onProgress({
        step: 'complete',
        progress: 100,
        message: 'Processing complete!'
      })

      return results
    } catch (error: any) {
      log.error('Pipeline error:', error)
      results.errors.push({ step: 'pipeline', error: error.message, critical: true })
      return results
    }
  }
}

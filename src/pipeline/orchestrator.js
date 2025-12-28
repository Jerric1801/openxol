const TranscriptionModule = require('./transcription');
const DiarizationModule = require('./diarization');
const AnalysisModule = require('./analysis');
const DocxGenModule = require('./docx-gen');
const FileUtils = require('../utils/file-utils');
const path = require('path');
const fs = require('fs').promises;
const log = require('electron-log');

class MeetingPipeline {
  constructor(config) {
    this.config = config;
    this.transcription = new TranscriptionModule(config);
    this.diarization = new DiarizationModule(config);
    this.analysis = new AnalysisModule(config);
    this.docxGen = new DocxGenModule(config);
    this.isCancelled = false;
    this.onPartialResult = null; // Callback for partial results (e.g., transcription ready)
  }
  
  cancel() {
    this.isCancelled = true;
    // Cancel any running processes
    if (this.diarization && this.diarization.cancel) {
      this.diarization.cancel();
    }
    log.info('Pipeline cancellation requested');
  }

  /**
   * Safely extract text from transcript object
   * Handles both object format {text, segments, ...} and plain string
   */
  static extractTranscriptText(transcript) {
    if (!transcript) {
      log.debug('extractTranscriptText: transcript is null/undefined');
      return '';
    }
    
    if (typeof transcript === 'string') {
      log.debug('extractTranscriptText: transcript is string, length:', transcript.length);
      return transcript;
    }
    
    if (typeof transcript === 'object') {
      // Try to get text property directly
      if (transcript.text !== undefined && transcript.text !== null) {
        const text = String(transcript.text);
        log.debug('extractTranscriptText: found text property, length:', text.length);
        return text;
      }
      
      // If no text property, try to reconstruct from segments
      if (transcript.segments && Array.isArray(transcript.segments) && transcript.segments.length > 0) {
        const reconstructed = transcript.segments
          .map(s => s.text || '')
          .filter(t => t && t.trim().length > 0)
          .join(' ');
        log.debug(`extractTranscriptText: reconstructed from ${transcript.segments.length} segments, length:`, reconstructed.length);
        return reconstructed;
      }
      
      // Last resort: try raw property
      if (transcript.raw) {
        if (transcript.raw.text !== undefined && transcript.raw.text !== null) {
          const text = String(transcript.raw.text);
          log.debug('extractTranscriptText: found raw.text, length:', text.length);
          return text;
        }
        
        // Try to reconstruct from raw transcription array (Whisper.cpp format)
        if (transcript.raw.transcription && Array.isArray(transcript.raw.transcription) && transcript.raw.transcription.length > 0) {
          const reconstructed = transcript.raw.transcription
            .map(item => item.text || '')
            .filter(t => t && t.trim().length > 0)
            .join(' ');
          log.debug(`extractTranscriptText: reconstructed from raw.transcription (${transcript.raw.transcription.length} items), length:`, reconstructed.length);
          return reconstructed;
        }
        
        // Try to reconstruct from raw segments
        if (transcript.raw.segments && Array.isArray(transcript.raw.segments) && transcript.raw.segments.length > 0) {
          const reconstructed = transcript.raw.segments
            .map(s => s.text || '')
            .filter(t => t && t.trim().length > 0)
            .join(' ');
          log.debug(`extractTranscriptText: reconstructed from raw.segments (${transcript.raw.segments.length} segments), length:`, reconstructed.length);
          return reconstructed;
        }
      }
      
      log.debug('extractTranscriptText: no text found in transcript object');
    }
    
    return '';
  }

  /**
   * Process the audio file
   * @param {string} audioPath - Path to audio file
   * @param {function} onProgress - Optional callback for progress updates: (step, progress, message)
   */
  async process(audioPath, onProgress = () => {}) {
    log.info(`Starting pipeline for: ${audioPath}`);
    
    // Track temp files for cleanup (transcription module handles its own cleanup, but we track converted WAV)
    const tempFiles = [];
    const originalExt = FileUtils.getFileExtension(audioPath);
    const needsConversion = originalExt !== 'wav';

    const results = {
      audioPath,
      transcript: null,
      diarized: null,
      analysis: null,
      docxPath: null,
      errors: []
    };

    // Calculate step ranges for overall progress
    const stepRanges = {
      transcription: { start: 0, end: 25 },
      diarization: { start: 25, end: 50 },
      analysis: { start: 50, end: 75 },
      document: { start: 75, end: 100 }
    };
    
    const calculateOverallProgress = (step, stepProgress) => {
      const range = stepRanges[step];
      if (!range) return stepProgress;
      return range.start + (stepProgress / 100) * (range.end - range.start);
    };

    try {
      // STEP 1: Transcription (CRITICAL - Fail Fast)
      if (onProgress) {
        onProgress({ 
          step: 'transcription', 
          progress: calculateOverallProgress('transcription', 0),
          stepProgress: 0,
          message: 'Starting transcription...',
          overallProgress: 0
        });
      }
      log.info('Step 1: Transcribing audio...');
      
      try {
        results.transcript = await this.transcription.transcribe(audioPath);
        
        // Validate transcript has content
        const transcriptText = MeetingPipeline.extractTranscriptText(results.transcript);
        log.info(`Extracted transcript text length: ${transcriptText?.length || 0}`);
        
        if (!transcriptText || transcriptText.trim().length === 0) {
          // Log detailed information for debugging
          log.error('Transcription validation failed - no text found');
          log.error('Transcript object:', JSON.stringify(results.transcript, null, 2));
          log.error('Transcript type:', typeof results.transcript);
          if (results.transcript && typeof results.transcript === 'object') {
            log.error('Transcript keys:', Object.keys(results.transcript));
            if (results.transcript.raw) {
              log.error('Raw transcript keys:', Object.keys(results.transcript.raw));
              log.error('Raw transcript text:', results.transcript.raw.text);
              log.error('Raw transcript segments count:', results.transcript.raw.segments?.length || 0);
            }
          }
          throw new Error('Transcription completed but produced no text');
        }
        
        if (onProgress) {
          onProgress({ 
            step: 'transcription', 
            progress: calculateOverallProgress('transcription', 100),
            stepProgress: 100,
            message: 'Transcription completed',
            overallProgress: 25
          });
          
          // Send partial result with transcription immediately
          onProgress({
            step: 'partial-result',
            type: 'transcription',
            result: {
              transcript: results.transcript,
              errors: results.errors
            },
            message: 'Transcription ready - continuing with additional processing...'
          });
        }
        log.info(`Transcription completed successfully. Text length: ${transcriptText.length} characters`);
      } catch (error) {
        // Transcription failed - STOP pipeline, return error gracefully
        log.error('Transcription failed (critical):', error);
        results.errors.push({ step: 'transcription', error: error.message, critical: true });
        
        if (onProgress) {
          onProgress({ step: 'error', progress: 0, message: `Transcription failed: ${error.message}` });
        }
        
        // Return immediately - no point continuing without transcript
        return results;
      }

      // STEP 2: Diarization (OPTIONAL - Best Effort)
      if (this.config.diarization.enabled && !this.isCancelled) {
        try {
          if (onProgress) {
            onProgress({ 
              step: 'diarization', 
              progress: calculateOverallProgress('diarization', 0),
              stepProgress: 0,
              message: 'Starting diarization...',
              overallProgress: 25
            });
          }
          log.info('Step 2: Diarizing transcript...');
          
          // Check cancellation before starting
          if (this.isCancelled) {
            throw new Error('Processing cancelled by user');
          }
          
          results.diarized = await this.diarization.diarize(audioPath, results.transcript);
          
          // Check cancellation after completion
          if (this.isCancelled) {
            log.info('Diarization completed but processing was cancelled');
            return results;
          }
          
          if (onProgress) {
            onProgress({ 
              step: 'diarization', 
              progress: calculateOverallProgress('diarization', 100),
              stepProgress: 100,
              message: 'Diarization completed',
              overallProgress: 50
            });
          }
          log.info('Diarization completed');
        } catch (error) {
          log.error('Diarization failed (non-critical):', error);
          
          // Check if error is due to cancellation
          if (error.message && error.message.includes('cancelled')) {
            log.info('Diarization cancelled by user');
            results.errors.push({ step: 'diarization', error: 'Processing cancelled by user', critical: false });
            return results; // Return early with transcription
          }
          
          // Check if error is due to timeout
          if (error.message && error.message.includes('timed out')) {
            log.warn('Diarization timed out - this may indicate the audio file is too long or has issues');
            results.errors.push({ step: 'diarization', error: 'Diarization timed out after 30 minutes. Try disabling diarization or use a shorter audio file.', critical: false });
          } else {
            results.errors.push({ step: 'diarization', error: error.message, critical: false });
          }
          
          // Continue - we have transcript, can still do analysis
          if (onProgress) {
            onProgress({ 
              step: 'diarization', 
              progress: calculateOverallProgress('diarization', 0),
              stepProgress: 0,
              message: `Diarization failed: ${error.message}`,
              overallProgress: 25
            });
          }
        }
      }

      // STEP 3: Analysis (OPTIONAL - Best Effort)
      if (this.config.analysis.enabled && !this.isCancelled) {
        try {
          // Determine which transcript to use (prefer diarized if available and has text)
          let transcriptSource = null;
          let sourceName = '';
          
          // Try diarized first if available
          if (results.diarized) {
            const diarizedText = MeetingPipeline.extractTranscriptText(results.diarized);
            if (diarizedText && diarizedText.trim().length > 0) {
              transcriptSource = results.diarized;
              sourceName = 'diarized';
              log.info(`Using diarized transcript for analysis (${diarizedText.length} chars)`);
            } else {
              log.warn('Diarized transcript available but has no text, falling back to original transcript');
            }
          }
          
          // Fall back to original transcript if diarized not available or empty
          if (!transcriptSource && results.transcript) {
            const transcriptText = MeetingPipeline.extractTranscriptText(results.transcript);
            if (transcriptText && transcriptText.trim().length > 0) {
              transcriptSource = results.transcript;
              sourceName = 'transcript';
              log.info(`Using original transcript for analysis (${transcriptText.length} chars)`);
            }
          }
          
          // Validate we have a valid transcript source
          if (!transcriptSource) {
            log.error('No valid transcript source available for analysis');
            log.error(`  Has diarized: ${!!results.diarized}`);
            log.error(`  Has transcript: ${!!results.transcript}`);
            if (results.transcript) {
              log.error(`  Transcript type: ${typeof results.transcript}`);
              log.error(`  Transcript keys: ${Object.keys(results.transcript || {})}`);
            }
            throw new Error('No transcript text available for analysis');
          }
          
          // Extract text from the chosen source
          const textToAnalyze = MeetingPipeline.extractTranscriptText(transcriptSource);
          
          // Final validation
          if (!textToAnalyze || typeof textToAnalyze !== 'string' || textToAnalyze.trim().length === 0) {
            log.error(`Text extraction failed from ${sourceName} source`);
            log.error(`Extracted text length: ${textToAnalyze?.length || 0}`);
            log.error(`Transcript source type: ${typeof transcriptSource}`);
            log.error(`Transcript source keys: ${Object.keys(transcriptSource || {})}`);
            if (transcriptSource && transcriptSource.raw) {
              log.error(`Raw transcript keys: ${Object.keys(transcriptSource.raw)}`);
            }
            throw new Error('No transcript text available for analysis');
          }
          
          log.info(`Extracted ${textToAnalyze.length} characters from ${sourceName} transcript for analysis`);
          
          const diarizationProgress = this.config.diarization.enabled ? 50 : 25;
          
          if (onProgress) {
            onProgress({ 
              step: 'analysis', 
              progress: calculateOverallProgress('analysis', 0),
              stepProgress: 0,
              message: 'Starting AI analysis...',
              overallProgress: diarizationProgress
            });
          }
          log.info(`Step 3: Analyzing transcript (${textToAnalyze.length} characters)...`);
          
          // Check cancellation before starting
          if (this.isCancelled) {
            throw new Error('Processing cancelled by user');
          }
          
          results.analysis = await this.analysis.analyze(textToAnalyze);
          
          // Check cancellation after completion
          if (this.isCancelled) {
            log.info('Analysis completed but processing was cancelled');
            return results;
          }
          
          if (onProgress) {
            onProgress({ 
              step: 'analysis', 
              progress: calculateOverallProgress('analysis', 100),
              stepProgress: 100,
              message: 'Analysis completed',
              overallProgress: 75
            });
          }
          log.info('Analysis completed');
        } catch (error) {
          log.error('Analysis failed (non-critical):', error);
          results.errors.push({ step: 'analysis', error: error.message, critical: false });
          // Continue - we have transcript, can still generate DOCX
          const diarizationProgress = this.config.diarization.enabled ? 50 : 25;
          if (onProgress) {
            onProgress({ 
              step: 'analysis', 
              progress: calculateOverallProgress('analysis', 0),
              stepProgress: 0,
              message: `Analysis failed: ${error.message}`,
              overallProgress: diarizationProgress
            });
          }
        }
      }

      // STEP 4: Document Generation (OPTIONAL - Best Effort)
      if (this.config.document.enabled && !this.isCancelled) {
        try {
          const analysisProgress = this.config.analysis.enabled ? 75 : (this.config.diarization.enabled ? 50 : 25);
          
          if (onProgress) {
            onProgress({ 
              step: 'document', 
              progress: calculateOverallProgress('document', 0),
              stepProgress: 0,
              message: 'Generating report...',
              overallProgress: analysisProgress
            });
          }
          log.info('Step 4: Generating DOCX report...');
          
          // Check cancellation before starting
          if (this.isCancelled) {
            throw new Error('Processing cancelled by user');
          }
          
          const outputDir = this.config.output.directory || path.join(require('os').homedir(), 'Meeting Analysis');
          await FileUtils.ensureDirectoryExists(outputDir);
          
          const fileName = FileUtils.getFileNameWithoutExtension(audioPath);
          const timestamp = this.config.output.useTimestampedDirs 
            ? new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
            : '';
          const outputPath = path.join(
            outputDir,
            timestamp ? `${timestamp}_${fileName}_report.docx` : `${fileName}_report.docx`
          );
          
          results.docxPath = await this.docxGen.generateReport(
            results.transcript,
            results.diarized,
            results.analysis,
            outputPath
          );
          
          // Check cancellation after completion
          if (this.isCancelled) {
            log.info('Document generation completed but processing was cancelled');
            return results;
          }
          
          if (onProgress) {
            onProgress({ 
              step: 'document', 
              progress: calculateOverallProgress('document', 100),
              stepProgress: 100,
              message: 'Report generated',
              overallProgress: 100
            });
          }
          log.info(`DOCX report generated: ${results.docxPath}`);
        } catch (error) {
          log.error('DOCX generation failed (non-critical):', error);
          results.errors.push({ step: 'docx', error: error.message, critical: false });
          // Continue - transcript is still available for display/download
          const analysisProgress = this.config.analysis.enabled ? 75 : (this.config.diarization.enabled ? 50 : 25);
          if (onProgress) {
            onProgress({ 
              step: 'document', 
              progress: calculateOverallProgress('document', 0),
              stepProgress: 0,
              message: `Report generation failed: ${error.message}`,
              overallProgress: analysisProgress
            });
          }
        }
      }

      if (onProgress) {
        onProgress({ 
          step: 'complete', 
          progress: 100, 
          stepProgress: 100,
          message: 'Processing complete!',
          overallProgress: 100
        });
      }
      log.info('Pipeline completed successfully');
      return results;
    } catch (error) {
      // This catch should only handle unexpected errors, not transcription failures
      log.error('Unexpected pipeline error:', error);
      results.errors.push({ step: 'pipeline', error: error.message, critical: true });
      if (onProgress) {
        onProgress({ step: 'error', progress: 0, message: `Pipeline failed: ${error.message}` });
      }
      return results;
    } finally {
      // Cleanup: Transcription module already handles its own temp file cleanup
      // But we ensure any tracked temp files are cleaned up
      if (tempFiles.length > 0) {
        log.info(`Cleaning up ${tempFiles.length} temporary files...`);
        for (const file of tempFiles) {
          try {
            await FileUtils.cleanupFile(file);
          } catch (e) {
            log.warn(`Failed to cleanup temp file ${file}:`, e.message);
          }
        }
      }
    }
  }
}

module.exports = MeetingPipeline;

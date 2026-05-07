import { spawn, execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import log from 'electron-log'
import { FileUtils } from '../utils/file-utils'
import * as binaryPaths from '../utils/binary-paths'
import { SetupManager } from '../utils/setup-manager'
import { TranscriptionModule } from './transcription'
import type { Config } from '../../types/config'
import type { TranscriptResult } from '../../types/pipeline'

export class DiarizationModule {
  private config: Config
  private currentProcess: any = null

  constructor(config: Config) {
    this.config = config
  }

  async diarize(audioPath: string, transcript: TranscriptResult): Promise<TranscriptResult> {
    if (this.config.diarization.method === 'whisper-native') {
      return await this.diarizeWithWhisper(audioPath)
    }
    return transcript
  }

  async diarizeWithWhisper(audioPath: string): Promise<TranscriptResult> {
    const whisperBin = binaryPaths.getBinaryPath('whisper')
    const modelPath = await binaryPaths.getModelPath(this.config.transcription?.model || 'base.en')

    if (!(await FileUtils.fileExists(whisperBin))) {
      const setupManager = new SetupManager()
      const instructions = setupManager.getInstallationInstructions('whisper')
      throw new Error(`Whisper binary not found at: ${whisperBin}\n\n${instructions}`)
    }

    // Binary validation logic
    try {
      const runHelp = (flag: string): string => {
        try {
          return execFileSync(whisperBin, [flag], { encoding: 'utf-8', timeout: 2000, maxBuffer: 16384 })
        } catch (e: any) {
          return String(e.stdout || '') + String(e.stderr || '')
        }
      }
      const helpOutput = runHelp('--help') || runHelp('-h')

      const isPythonWhisper =
        helpOutput.includes('--output_format') ||
        helpOutput.includes('argument --output_format/-f') ||
        (helpOutput.includes('usage: whisper') && !helpOutput.includes('whisper-cli'))

      const isWhisperCpp =
        helpOutput.includes('--output-json') ||
        helpOutput.includes('-oj') ||
        helpOutput.includes('whisper-cli') ||
        helpOutput.includes('file0 file1 ...')

      if (isPythonWhisper && !isWhisperCpp) {
        throw new Error(`Wrong binary detected: Python whisper CLI instead of whisper.cpp`)
      }
    } catch (error: any) {
      if (error.message.includes('Wrong binary detected')) {
        throw error
      }
      log.warn('Binary validation check failed:', error.message)
    }

    const ext = FileUtils.getFileExtension(audioPath)
    let wavPath: string
    const workingDir = await FileUtils.getWorkingDirectory()

    if (ext === 'wav') {
      const fileName = path.basename(audioPath)
      wavPath = path.join(workingDir, `diarize_${fileName}`)
      await fsPromises.copyFile(audioPath, wavPath)
    } else {
      const transcription = new TranscriptionModule(this.config)
      wavPath = await transcription.convertAudio(audioPath)
    }

    const outputBaseName = FileUtils.getFileNameWithoutExtension(path.basename(wavPath))
    const jsonOutputPath = path.join(workingDir, `${outputBaseName}.json`)

    return new Promise((resolve, reject) => {
      const args = [
        '-m',
        modelPath,
        '-f',
        wavPath,
        '-of',
        path.join(workingDir, outputBaseName),
        '-di',
        '-oj'
      ]

      log.info(`Running whisper diarization: ${whisperBin} ${args.join(' ')}`)
      const proc = spawn(whisperBin, args)

      let stdout = ''
      let stderr = ''

      const timeoutMs = 30 * 60 * 1000
      const timeout = setTimeout(() => {
        if (!proc.killed) {
          log.error('Diarization timeout - killing process')
          proc.kill('SIGTERM')
          reject(new Error('Diarization timed out after 30 minutes'))
        }
      }, timeoutMs)

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
        log.debug('Whisper diarization progress:', data.toString())
      })

      proc.on('close', async (code) => {
        clearTimeout(timeout)
        this.currentProcess = null
        if (code === 0) {
          try {
            let result: any
            try {
              const content = await fsPromises.readFile(jsonOutputPath, 'utf-8')
              result = JSON.parse(content)
            } catch {
              result = JSON.parse(stdout)
            }

            await FileUtils.cleanupFile(wavPath)
            await FileUtils.cleanupFile(jsonOutputPath)

            resolve({
              text: result.text || '',
              segments: result.segments || [],
              raw: result
            })
          } catch (error: any) {
            reject(new Error(`Failed to parse diarization output: ${error.message}`))
          }
        } else {
          reject(new Error(`Diarization failed with code ${code}: ${stderr}`))
        }
      })

      proc.on('error', (error) => {
        clearTimeout(timeout)
        this.currentProcess = null
        reject(new Error(`Failed to start whisper diarization: ${error.message}`))
      })

      this.currentProcess = proc
    })
  }

  cancel(): void {
    if (this.currentProcess && !this.currentProcess.killed) {
      log.info('Cancelling diarization process...')
      this.currentProcess.kill('SIGTERM')
    }
  }
}

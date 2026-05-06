import { spawn, execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import log from 'electron-log'
import { FileUtils } from '../utils/file-utils'
import * as binaryPaths from '../utils/binary-paths'
import { SetupManager } from '../utils/setup-manager'
import type { Config } from '../../types/config'
import type { TranscriptResult } from '../../types/pipeline'

export class TranscriptionModule {
  private config: Config

  constructor(config: Config) {
    this.config = config
  }

  async convertAudio(audioPath: string): Promise<string> {
    const ext = FileUtils.getFileExtension(audioPath)
    if (ext === 'wav') {
      const workingDir = await FileUtils.getWorkingDirectory()
      const fileName = path.basename(audioPath)
      const outputPath = path.join(workingDir, fileName)
      await fsPromises.copyFile(audioPath, outputPath)
      return outputPath
    }

    const workingDir = await FileUtils.getWorkingDirectory()
    const fileName = FileUtils.getFileNameWithoutExtension(path.basename(audioPath))
    const outputPath = path.join(workingDir, `${fileName}.wav`)
    const ffmpegPath = binaryPaths.getBinaryPath('ffmpeg')

    if (!(await FileUtils.fileExists(ffmpegPath))) {
      const setupManager = new SetupManager()
      const instructions = setupManager.getInstallationInstructions('ffmpeg')
      throw new Error(
        `FFmpeg binary not found at: ${ffmpegPath}\n\n${instructions}\n\nPlease complete the setup first or install FFmpeg manually.`
      )
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-i',
        audioPath,
        '-ar',
        '16000', // Sample rate 16kHz
        '-ac',
        '1', // Mono
        '-y', // Overwrite output file
        outputPath
      ])

      let stderr = ''
      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', async (code) => {
        const outputExists = await FileUtils.fileExists(outputPath)
        if (code === 0 || outputExists) {
          resolve(outputPath)
        } else {
          reject(new Error(`Audio conversion failed: ${stderr || 'Unknown error'}`))
        }
      })

      proc.on('error', (error: any) => {
        if (error.code === 'ENOENT') {
          const setupManager = new SetupManager()
          const instructions = setupManager.getInstallationInstructions('ffmpeg')
          reject(new Error(`FFmpeg binary not found. ${instructions}`))
        } else {
          reject(new Error(`Failed to start ffmpeg: ${error.message}`))
        }
      })
    })
  }

  async transcribe(audioPath: string): Promise<TranscriptResult> {
    const whisperBin = binaryPaths.getBinaryPath('whisper')
    const modelPath = await binaryPaths.getModelPath(this.config.transcription.model || 'base.en')

    if (!(await FileUtils.fileExists(whisperBin))) {
      const setupManager = new SetupManager()
      const instructions = setupManager.getInstallationInstructions('whisper')
      throw new Error(
        `Whisper binary not found at: ${whisperBin}\n\n${instructions}\n\nPlease complete the setup first or install Whisper manually.`
      )
    }

    // Binary validation logic
    try {
      try {
        const stats = fs.lstatSync(whisperBin)
        if (stats.isSymbolicLink()) {
          const realPath = fs.realpathSync(whisperBin)
          log.info(`Binary is a symlink pointing to: ${realPath}`)
          if (
            realPath.includes('pyenv') ||
            realPath.includes('python') ||
            realPath.includes('pip') ||
            realPath.includes('.pyenv')
          ) {
            throw new Error(`Wrong binary detected: Python whisper CLI instead of whisper.cpp`)
          }
        }
      } catch (symlinkError: any) {
        if (symlinkError.message.includes('Wrong binary detected')) {
          throw symlinkError
        }
        log.debug('Symlink check failed:', symlinkError.message)
      }

      const helpOutput = execSync(
        `"${whisperBin}" --help 2>&1 | head -50 || "${whisperBin}" -h 2>&1 | head -50 || true`,
        {
          encoding: 'utf-8',
          timeout: 2000,
          maxBuffer: 16384
        }
      )

      const isPythonWhisper =
        helpOutput.includes('--output_format {txt,vtt,srt,tsv,json,all}') ||
        helpOutput.includes('--output_format/-f') ||
        (helpOutput.includes('usage: whisper') && helpOutput.includes('--output_format')) ||
        (helpOutput.includes('--model MODEL') && helpOutput.includes('--output_format')) ||
        helpOutput.includes('--output_dir OUTPUT_DIR')

      const isWhisperCpp =
        helpOutput.includes('--output-json') ||
        helpOutput.includes('-oj') ||
        helpOutput.includes('whisper-cli') ||
        (helpOutput.includes('--file FNAME') && helpOutput.includes('input audio file')) ||
        helpOutput.includes('file0 file1 ...') ||
        helpOutput.includes('supported audio formats:')

      if (isPythonWhisper && !isWhisperCpp) {
        throw new Error(`Wrong binary detected: Python whisper CLI instead of whisper.cpp`)
      }
    } catch (error: any) {
      if (error.message.includes('Wrong binary detected')) {
        throw error
      }
      log.warn('Binary validation check failed:', error.message)
    }

    if (!(await FileUtils.fileExists(modelPath))) {
      throw new Error(`Whisper model not found at ${modelPath}. Please complete setup.`)
    }

    const wavPath = await this.convertAudio(audioPath)
    const workingDir = await FileUtils.getWorkingDirectory()
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
        '-oj',
        '-nt'
      ]

      if (this.config.transcription.language) {
        args.push('-l', this.config.transcription.language)
      }

      log.info(`Running whisper.cpp: ${whisperBin} ${args.join(' ')}`)
      const proc = spawn(whisperBin, args)

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
        log.debug('Whisper progress:', data.toString())
      })

      proc.on('close', async (code) => {
        if (code === 0) {
          try {
            await new Promise((resolve) => setTimeout(resolve, 100))

            let result: any
            if (await FileUtils.fileExists(jsonOutputPath)) {
              const content = await fsPromises.readFile(jsonOutputPath, 'utf-8')
              result = JSON.parse(content)
            } else if (stdout.trim()) {
              result = JSON.parse(stdout)
            } else {
              throw new Error('No transcription output found')
            }

            let transcriptText = ''
            let segments: any[] = []
            let language = ''

            if (result.text) {
              transcriptText = result.text
              segments = result.segments || []
              language = result.language || ''
            } else if (
              result.transcription &&
              Array.isArray(result.transcription) &&
              result.transcription.length > 0
            ) {
              transcriptText = result.transcription
                .map((item: any) => item.text || '')
                .join(' ')
              segments = result.transcription.map((item: any) => ({
                text: item.text || '',
                start: item.offsets?.from ? item.offsets.from / 1000 : 0,
                end: item.offsets?.to ? item.offsets.to / 1000 : 0
              }))
              language = result.result?.language || result.params?.language || ''
            } else if (result.segments && Array.isArray(result.segments)) {
              transcriptText = result.segments.map((s: any) => s.text || '').join(' ')
              segments = result.segments
              language = result.language || ''
            }

            await FileUtils.cleanupFile(wavPath)
            await FileUtils.cleanupFile(jsonOutputPath)

            resolve({
              text: transcriptText,
              segments,
              language,
              raw: result
            })
          } catch (error: any) {
            reject(new Error(`Failed to parse transcription: ${error.message}`))
          }
        } else {
          reject(new Error(`Transcription failed with code ${code}: ${stderr}`))
        }
      })

      proc.on('error', (error) => {
        reject(new Error(`Failed to start whisper: ${error.message}`))
      })
    })
  }
}

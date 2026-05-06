import { describe, it, expect } from 'vitest'
import { FileUtils } from './file-utils'

describe('FileUtils', () => {
  it('should get file extension', () => {
    expect(FileUtils.getFileExtension('test.mp3')).toBe('mp3')
    expect(FileUtils.getFileExtension('test.WAV')).toBe('wav')
    expect(FileUtils.getFileExtension('no-extension')).toBe('')
  })

  it('should get filename without extension', () => {
    expect(FileUtils.getFileNameWithoutExtension('test.mp3')).toBe('test')
    expect(FileUtils.getFileNameWithoutExtension('/path/to/file.wav')).toBe('file')
  })

  it('should format file size', () => {
    expect(FileUtils.formatFileSize(0)).toBe('0 Bytes')
    expect(FileUtils.formatFileSize(1024)).toBe('1 KB')
    expect(FileUtils.formatFileSize(1024 * 1024)).toBe('1 MB')
  })
})

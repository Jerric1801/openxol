import { fileHandler } from './file-handler'

export class RecordingUI {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private audioContext: AudioContext | null = null
  private animFrameId: number | null = null
  private timerInterval: ReturnType<typeof setInterval> | null = null
  private startTime = 0
  private isRecording = false

  constructor() {
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    document.getElementById('recordArea')?.addEventListener('click', () => {
      this.startRecording()
    })
    document.getElementById('stopRecordBtn')?.addEventListener('click', () => {
      this.stopRecording()
    })
    document.getElementById('cancelRecordBtn')?.addEventListener('click', () => {
      this.cancelRecording()
    })
  }

  async startRecording(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })

      this.audioContext = new AudioContext()
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 512
      const source = this.audioContext.createMediaStreamSource(this.stream)
      source.connect(this.analyser)

      const ok = await (window as any).electronAPI.startRecording()
      if (!ok) throw new Error('Main process failed to open recording file')

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType })
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          e.data.arrayBuffer().then((buf) => {
            ;(window as any).electronAPI.sendRecordingChunk(buf)
          })
        }
      }
      this.mediaRecorder.start(500)

      this.isRecording = true
      this.startTime = Date.now()
      this.showRecordingUI()
      this.startTimer()
      this.startWaveform()
    } catch (err: any) {
      console.error('Recording start failed:', err)
      this.resetUI()
      if (err.name === 'NotAllowedError') {
        alert('Microphone permission denied. Allow mic access and try again.')
      }
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.isRecording) return

    this.mediaRecorder?.stop()
    this.stream?.getTracks().forEach((t) => t.stop())

    const wavPath: string | null = await (window as any).electronAPI.stopRecording()

    this.cleanup()
    this.hideRecordingUI()

    if (wavPath) {
      fileHandler.addToQueue(wavPath, null)
      fileHandler.updateQueueDisplay()
    }
  }

  cancelRecording(): void {
    if (!this.isRecording) return

    this.mediaRecorder?.stop()
    this.stream?.getTracks().forEach((t) => t.stop())
    ;(window as any).electronAPI.cancelRecording()

    this.cleanup()
    this.hideRecordingUI()
  }

  private cleanup(): void {
    this.isRecording = false
    if (this.timerInterval !== null) clearInterval(this.timerInterval)
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId)
    this.audioContext?.close()
    this.mediaRecorder = null
    this.stream = null
    this.analyser = null
    this.audioContext = null
    this.timerInterval = null
    this.animFrameId = null
  }

  private showRecordingUI(): void {
    const idle = document.getElementById('heroIdle')
    const rec = document.getElementById('heroRecording')
    const hero = document.getElementById('heroSection')
    if (idle) idle.style.display = 'none'
    if (rec) rec.style.display = 'flex'
    hero?.classList.add('hero-active')

    // Size the canvas to its container
    const canvas = document.getElementById('waveformCanvas') as HTMLCanvasElement | null
    if (canvas) {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
  }

  private hideRecordingUI(): void {
    const idle = document.getElementById('heroIdle')
    const rec = document.getElementById('heroRecording')
    const hero = document.getElementById('heroSection')
    const timer = document.getElementById('recordingTimer')
    if (idle) idle.style.display = 'flex'
    if (rec) rec.style.display = 'none'
    hero?.classList.remove('hero-active')
    if (timer) timer.textContent = '00:00'
  }

  private resetUI(): void {
    this.cleanup()
    this.hideRecordingUI()
  }

  private startTimer(): void {
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000)
      const m = Math.floor(elapsed / 60).toString().padStart(2, '0')
      const s = (elapsed % 60).toString().padStart(2, '0')
      const el = document.getElementById('recordingTimer')
      if (el) el.textContent = `${m}:${s}`
    }, 1000)
  }

  private startWaveform(): void {
    const canvas = document.getElementById('waveformCanvas') as HTMLCanvasElement | null
    if (!canvas || !this.analyser) return

    const ctx = canvas.getContext('2d')!
    const bufferLength = this.analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = (): void => {
      this.animFrameId = requestAnimationFrame(draw)
      this.analyser!.getByteTimeDomainData(dataArray)

      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)

      ctx.lineWidth = 2.5
      ctx.strokeStyle = '#48D1E2'
      ctx.shadowBlur = 8
      ctx.shadowColor = 'rgba(72, 209, 226, 0.6)'
      ctx.beginPath()

      const sliceWidth = width / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0
        const y = (v * height) / 2
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        x += sliceWidth
      }

      ctx.lineTo(width, height / 2)
      ctx.stroke()
    }

    draw()
  }
}

export const recordingUI = new RecordingUI()

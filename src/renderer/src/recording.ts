import { fileHandler } from './file-handler'

export class RecordingUI {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private systemStream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private audioContext: AudioContext | null = null
  private animFrameId: number | null = null
  private timerInterval: ReturnType<typeof setInterval> | null = null
  private startTime = 0
  private isRecording = false
  private recordMode: 'mic' | 'system-mic' = 'mic'
  private blackholeDeviceId: string | null = null
  private platform: string = ''

  constructor() {
    this.setupEventListeners()
    this.initPlatformCapabilities()
  }

  private initPlatformCapabilities(): void {
    this.platform = (window as any).electronAPI.getPlatform()

    if (this.platform !== 'darwin') return

    // macOS: hide by default, reveal only if BlackHole is installed
    const bar = document.getElementById('recordModeBar')
    if (bar) bar.style.display = 'none'

    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const blackhole = devices.find(
        (d) => d.kind === 'audioinput' && d.label.toLowerCase().includes('blackhole')
      )
      if (blackhole?.deviceId) {
        this.blackholeDeviceId = blackhole.deviceId
        if (bar) bar.style.display = ''
        const pill = document.getElementById('modeSystemMic')
        if (pill) pill.title = 'Mic + System audio via BlackHole'
      }
    }).catch(() => {
      // Enumeration failed — keep mode bar hidden
    })
  }

  private setupEventListeners(): void {
    document.getElementById('recordArea')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.record-mode-bar')) return
      this.startRecording()
    })

    document.getElementById('recordModeBar')?.addEventListener('click', (e) => {
      const pill = (e.target as HTMLElement).closest<HTMLElement>('.record-mode-pill')
      if (!pill) return
      e.stopPropagation()
      const mode = pill.dataset['mode'] as 'mic' | 'system-mic'
      this.setMode(mode)
    })

    document.getElementById('stopRecordBtn')?.addEventListener('click', () => {
      this.stopRecording()
    })
    document.getElementById('cancelRecordBtn')?.addEventListener('click', () => {
      this.cancelRecording()
    })
  }

  private setMode(mode: 'mic' | 'system-mic'): void {
    this.recordMode = mode
    document.querySelectorAll('.record-mode-pill').forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset['mode'] === mode)
    })
    const desc = document.getElementById('recordModeDesc')
    if (desc) {
      if (mode === 'mic') {
        desc.textContent = 'Microphone only'
      } else {
        desc.textContent = this.blackholeDeviceId
          ? 'Mic + System (BlackHole)'
          : 'Mic + System audio'
      }
    }
  }

  async startRecording(): Promise<void> {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })

      this.audioContext = new AudioContext()
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 512

      let recordStream: MediaStream

      if (this.recordMode === 'system-mic') {
        const dest = this.audioContext.createMediaStreamDestination()
        const micSrc = this.audioContext.createMediaStreamSource(micStream)
        micSrc.connect(this.analyser)
        micSrc.connect(dest)

        if (this.blackholeDeviceId) {
          // macOS + BlackHole: capture system audio routed through BlackHole input
          const bhStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: this.blackholeDeviceId } },
            video: false
          })
          this.systemStream = bhStream
          const sysSrc = this.audioContext.createMediaStreamSource(bhStream)
          sysSrc.connect(dest)
        } else {
          // Windows/Linux: getDisplayMedia with loopback audio
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true
          })
          displayStream.getVideoTracks().forEach((t) => t.stop())
          this.systemStream = displayStream
          // System audio not available on macOS without a virtual audio driver
          if (displayStream.getAudioTracks().length > 0) {
            const sysSrc = this.audioContext.createMediaStreamSource(displayStream)
            sysSrc.connect(dest)
          }
        }

        recordStream = dest.stream
      } else {
        const micSrc = this.audioContext.createMediaStreamSource(micStream)
        micSrc.connect(this.analyser)
        recordStream = micStream
      }

      this.stream = micStream

      const ok = await (window as any).electronAPI.startRecording()
      if (!ok) throw new Error('Main process failed to open recording file')

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      this.mediaRecorder = new MediaRecorder(recordStream, { mimeType })
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
        alert('Permission denied. Allow access and try again.')
      } else if (err.name === 'AbortError' || err.name === 'NotReadableError') {
        // User cancelled getDisplayMedia picker — silent fail
      }
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.isRecording) return

    this.mediaRecorder?.stop()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.systemStream?.getTracks().forEach((t) => t.stop())

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
    this.systemStream?.getTracks().forEach((t) => t.stop())
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
    this.systemStream = null
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

    const label = rec?.querySelector('.recording-label')
    if (label) {
      if (this.recordMode === 'system-mic') {
        label.textContent = this.blackholeDeviceId
          ? 'Recording — Mic + BlackHole'
          : 'Recording — Mic + System'
      } else {
        label.textContent = 'Recording'
      }
    }

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

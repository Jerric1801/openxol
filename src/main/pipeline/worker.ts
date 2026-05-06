import { parentPort } from 'worker_threads'
import { MeetingPipeline } from './orchestrator'
import type { Config } from '../../types/config'

// Note: Electron's utilityProcess doesn't use worker_threads parentPort,
// it uses process.parentPort (if version >= 22) or just process.on('message').
// However, electron-vite might bundle this as a Node script.
// Let's check Electron version in package.json. It's ^28.0.0.

if (process.parentPort) {
  process.parentPort.on('message', async (e) => {
    const { type, audioPath, config } = e.data
    
    if (type === 'start') {
      const pipeline = new MeetingPipeline(config as Config)
      
      try {
        const result = await pipeline.process(audioPath, (progress) => {
          process.parentPort?.postMessage({ type: 'progress', data: progress })
        })
        process.parentPort?.postMessage({ type: 'result', data: result })
      } catch (error: any) {
        process.parentPort?.postMessage({ 
          type: 'error', 
          data: { message: error.message, stack: error.stack } 
        })
      }
    }
  })
}

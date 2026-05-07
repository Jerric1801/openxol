import log from 'electron-log'
import { MeetingPipeline } from './orchestrator'
import type { Config } from '../../types/config'

// utilityProcess has no stdout/stderr pipe — disable console transport before
// any pipeline modules import electron-log and attempt to write to stdout.
log.transports.console.level = false

// Belt-and-suspenders: swallow EPIPE from any stray stdout/stderr write
process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err })
process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err })

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

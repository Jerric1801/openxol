import { App } from './app'
import { initConfigUI } from './config'
import './recording'

document.addEventListener('DOMContentLoaded', () => {
  ;(window as any).app = new App()
  initConfigUI()
})

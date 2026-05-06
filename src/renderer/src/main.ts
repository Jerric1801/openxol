import { App } from './app'
import { initConfigUI } from './config'

document.addEventListener('DOMContentLoaded', () => {
  ;(window as any).app = new App()
  initConfigUI()
})

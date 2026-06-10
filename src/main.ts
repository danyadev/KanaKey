import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { App } from './components/App/App'
import './style.css'

createApp(App)
  .use(createPinia())
  .mount('#app')

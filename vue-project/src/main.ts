import { createApp } from 'vue'
import { createPinia } from 'pinia'

// Element Plus 暗色变量：只需在 html 上挂 class="dark" 即全组件生效
// （color-scheme 的亮/暗两端 EP 已分别在 base.css 与 dark/css-vars.css 中声明，无需自行处理）
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@/styles/index.scss'

import App from '@/App.vue'
import router from '@/router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

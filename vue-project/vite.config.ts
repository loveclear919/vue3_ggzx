import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { FileSystemIconLoader } from 'unplugin-icons/loaders'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // 让 Vite 能编译 .vue 单文件组件
    vue(),
    // 集成 Vue 官方浏览器调试面板
    vueDevTools(),
    // 把图标库/本地 SVG 转成 Vue 组件（~icons/xxx）
    Icons({
      autoInstall: true,
      compiler: 'vue3',
      customCollections: {
        // 'local' = 集合名，模板里用 <icon-local-xxx />
        local: FileSystemIconLoader('src/assets/icons'),
      },
    }),
    // 自动 import 函数式 API（ElMessage 这类）
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    // 自动注册模板组件 <el-button>等
    Components({
      resolvers: [
        IconsResolver({
          prefix: 'icon', // 自动引入的Icon组件统一前缀，默认为 i，设置false为不需要前缀
          // {prefix}-{collection}-{icon} 使用组件解析器时，您必须遵循名称转换才能正确推断图标。
          // alias: { park: 'icon-park' } 集合的别名
          enabledCollections: ['ep', 'mdi'], // 这是可选的，默认启用 Iconify 支持的所有集合['mdi']
        }),
        // 把"组件名"解析成"import 路径 + 样式路径"
        ElementPlusResolver(),
      ],
    }),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        // 给每个 SCSS 文件顶部自动注入
        additionalData: `@use "@/styles/variables.scss" as *;`,
      },
    },
  },
  // 开发时把 /api 与上传文件 /uploads 转发到后端 3000
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  // 把 @/ 映射到 src/

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})

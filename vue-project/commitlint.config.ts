import type { UserConfig } from '@commitlint/types'

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 允许的 commit type
    'type-enum': [
      2,
      'always',
      [
        // 新功能
        'feat',
        // 修复bug
        'fix',
        // 文档变更
        'docs',
        // 代码格式
        'style',
        // 重构
        'refactor',
        // 性能优化
        'perf',
        // 测试
        'test',
        // 工程配置
        'chore',
        // CI配置
        'ci',
        // 构建系统
        'build',
        // 回滚
        'revert',
      ],
    ],
    // type 强制小写
    'type-case': [2, 'always', 'lower-case'],
    // type 不能为空
    'type-empty': [2, 'never'],
    // scope 允许为空
    'scope-empty': [0],
    // subject 不能为空
    'subject-empty': [2, 'never'],
    // subject 首字母不强制大写
    'subject-case': [0],
    // header 最长 100 字符
    'header-max-length': [2, 'always', 100],
  },
}

export default config

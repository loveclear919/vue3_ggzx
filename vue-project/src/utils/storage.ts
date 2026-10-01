// localStorage key 统一收口：多处读写同一个 key 时改一处即可，避免拼写漂移
export const TOKEN_KEY = 'token'
export const LAST_VISITED_KEY = 'lastVisitedPath'
export const THEME_KEY = 'themeMode'

// token 清除唯一入口：登出（store）与 401 拦截器共用，杜绝「清了一半」的形态漂移
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

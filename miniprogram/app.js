const storage = require('./utils/storage.js')

App({
  onLaunch() {
    // 首次启动写入示例数据；已有数据则跳过
    storage.ensureSeedData()
  },
  globalData: {}
})

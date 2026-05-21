const printer = require('../../utils/printer.js')

Page({
  data: {
    saved: null,
    scanning: false,
    devices: [],
    connecting: '',
    isIOS: false
  },

  onLoad() {
    const sys = wx.getSystemInfoSync()
    this.setData({ isIOS: sys.platform === 'ios' })
    this.refresh()
  },

  onUnload() {
    if (this.data.scanning) {
      printer.stopDiscovery()
      printer.offDeviceFound()
    }
  },

  refresh() {
    this.setData({ saved: printer.getSavedDevice() })
  },

  async onScan() {
    if (this.data.scanning) return
    this.setData({ scanning: true, devices: [] })

    try {
      // iOS：先确保有定位权限
      if (this.data.isIOS) {
        await printer.ensureLocationPermission()
      }

      await printer.openAdapter()

      printer.onDeviceFound(d => {
        this.appendDevice(d)
      })

      await printer.startDiscovery()

      // iOS 还要主动拉一次"已发现的设备"，因为有些设备已经在系统蓝牙里了
      setTimeout(async () => {
        const list = await printer.getDiscoveredDevices()
        list.forEach(d => this.appendDevice(d))
      }, 1500)

      // 12 秒后自动停
      setTimeout(() => this.onStopScan(), 12000)
    } catch (e) {
      this.setData({ scanning: false })
      wx.showModal({
        title: '蓝牙错误',
        content: e.message || '请检查蓝牙是否开启',
        showCancel: false
      })
    }
  },

  appendDevice(d) {
    if (!d.name && !d.localName) return  // 过滤无名设备
    const name = d.name || d.localName
    if (this.data.devices.find(x => x.deviceId === d.deviceId)) return
    const arr = [...this.data.devices, {
      deviceId: d.deviceId,
      name,
      rssi: d.RSSI || 0
    }]
    arr.sort((a, b) => b.rssi - a.rssi)
    this.setData({ devices: arr })
  },

  async onStopScan() {
    if (!this.data.scanning) return
    await printer.stopDiscovery()
    printer.offDeviceFound()
    this.setData({ scanning: false })
  },

  async onPick(e) {
    const dev = e.currentTarget.dataset.dev
    this.setData({ connecting: dev.deviceId })
    await this.onStopScan()
    try {
      await printer.connectDevice(dev.deviceId, dev.name)
      wx.showToast({ title: '连接成功', icon: 'success' })
      this.setData({ connecting: '' })
      this.refresh()
    } catch (e) {
      this.setData({ connecting: '' })
      wx.showModal({ title: '连接失败', content: e.message || '请重试', showCancel: false })
    }
  },

  async onTest() {
    wx.showLoading({ title: '打印中' })
    try {
      await printer.printTest()
      wx.hideLoading()
      wx.showToast({ title: '已发送', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showModal({ title: '打印失败', content: e.message || '请检查打印机', showCancel: false })
    }
  },

  async onDisconnect() {
    const res = await wx.showModal({ title: '断开打印机？', content: '将清除已保存的设备' })
    if (!res.confirm) return
    try { await printer.disconnect() } catch (e) {}
    printer.clearDevice()
    this.refresh()
    wx.showToast({ title: '已断开' })
  }
})

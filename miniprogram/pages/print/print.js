const { formatTime } = require('../../utils/format.js')
const storage = require('../../utils/storage.js')
const printer = require('../../utils/printer.js')

Page({
  data: {
    ticket: null,
    newItems: [],
    timeStr: '',
    dateStr: '',
    printing: false
  },

  onLoad(options) {
    const ticket = storage.getTicket(options.ticketId)
    if (!ticket) {
      wx.showToast({ title: '订单不存在', icon: 'error' })
      return
    }
    let newItems = []
    if (options.newItems) {
      try { newItems = JSON.parse(decodeURIComponent(options.newItems)) } catch (e) {}
    } else {
      newItems = ticket.items
    }
    const now = new Date()
    this.setData({
      ticket,
      newItems,
      timeStr: formatTime(now),
      dateStr: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    })
  },

  // 打印后厨联
  async onPrint() {
    if (this.data.printing) return
    if (!printer.getSavedDevice()) {
      const res = await wx.showModal({
        title: '尚未连接打印机',
        content: '是否前往设置连接？',
        confirmText: '去连接'
      })
      if (res.confirm) {
        wx.navigateTo({ url: '/pages/printer-setup/printer-setup' })
      }
      return
    }
    this.setData({ printing: true })
    wx.showLoading({ title: '打印中' })
    try {
      await printer.printKitchen(this.data.ticket, this.data.newItems)
      wx.hideLoading()
      wx.showToast({ title: '已发送后厨', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showModal({
        title: '打印失败',
        content: (e.message || '未知错误') + '\n请检查打印机或前往「打印机设置」重连',
        showCancel: false
      })
    } finally {
      this.setData({ printing: false })
    }
  },

  onBack() {
    wx.switchTab({ url: '/pages/tables/tables' })
  },

  onContinueOrder() {
    const t = this.data.ticket
    wx.redirectTo({
      url: `/pages/ordering/ordering?tableId=${t.tableId}&tableName=${t.tableName}`
    })
  }
})

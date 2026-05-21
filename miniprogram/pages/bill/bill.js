const { formatMoney } = require('../../utils/format.js')
const storage = require('../../utils/storage.js')
const printer = require('../../utils/printer.js')

Page({
  data: {
    ticket: null,
    actualAmount: 0,
    payMethod: 'wechat'
  },

  onLoad(options) {
    this.ticketId = options.ticketId
    const ticket = storage.getTicket(this.ticketId)
    if (ticket) {
      this.setData({
        ticket,
        actualAmount: formatMoney(ticket.totalAmount)
      })
    }
  },

  onActualInput(e) {
    this.setData({ actualAmount: e.detail.value })
  },

  onPayMethod(e) {
    this.setData({ payMethod: e.currentTarget.dataset.method })
  },

  onQuickDiscount(e) {
    const ratio = e.currentTarget.dataset.ratio
    const total = this.data.ticket.totalAmount
    this.setData({ actualAmount: formatMoney(total * ratio) })
  },

  async onConfirm() {
    const actual = Number(this.data.actualAmount)
    if (isNaN(actual) || actual < 0) {
      wx.showToast({ title: '金额有误', icon: 'none' })
      return
    }
    const res = storage.closeTicket({
      ticketId: this.ticketId,
      actualAmount: actual,
      payMethod: this.data.payMethod
    })
    if (!res.success) {
      wx.showToast({ title: '失败', icon: 'error' })
      return
    }

    // 结账成功 → 询问是否打印顾客联
    const updated = storage.getTicket(this.ticketId)
    if (printer.getSavedDevice()) {
      const ask = await wx.showModal({
        title: '结账完成',
        content: '是否打印顾客小票？',
        confirmText: '打印',
        cancelText: '不用'
      })
      if (ask.confirm) {
        wx.showLoading({ title: '打印中' })
        try {
          await printer.printReceipt(updated)
          wx.hideLoading()
          wx.showToast({ title: '已打印', icon: 'success' })
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: '打印失败', icon: 'none' })
        }
      }
    } else {
      wx.showToast({ title: '结账完成', icon: 'success' })
    }

    setTimeout(() => {
      wx.navigateBack({
        delta: 2,
        fail: () => wx.switchTab({ url: '/pages/tables/tables' })
      })
    }, 1000)
  }
})

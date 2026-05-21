const { formatMoney, formatTime, formatDate, startOfDay } = require('../../utils/format.js')
const storage = require('../../utils/storage.js')

Page({
  data: {
    activeTab: 'today',
    orders: []
  },

  onShow() { this.load() },

  onSwitchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab }, () => this.load())
  },

  load() {
    let raw = storage.listTickets()
    if (this.data.activeTab === 'today') {
      const start = startOfDay().getTime()
      raw = raw.filter(o => o.openedAt >= start)
    } else if (this.data.activeTab === 'open') {
      raw = raw.filter(o => o.status === 'open')
    }
    raw.sort((a, b) => b.openedAt - a.openedAt)
    const orders = raw.map(o => ({
      ...o,
      amount: formatMoney(o.actualAmount != null ? o.actualAmount : o.totalAmount),
      time: formatTime(o.openedAt),
      date: formatDate(o.openedAt),
      statusLabel: this.statusLabel(o.status),
      payLabel: this.payLabel(o.payMethod)
    }))
    this.setData({ orders })
  },

  statusLabel(s) {
    return { open: '用餐中', paid: '已结账', cancelled: '已作废' }[s] || s
  },

  payLabel(m) {
    return { wechat: '微信', alipay: '支付宝', cash: '现金', voucher: '羊肉票' }[m] || ''
  },

  async onCancel(e) {
    const id = e.currentTarget.dataset.id
    const res = await wx.showModal({ title: '作废订单？', content: '此操作不可撤销' })
    if (!res.confirm) return
    storage.cancelTicket(id)
    wx.showToast({ title: '已作废' })
    this.load()
  },

  onContinue(e) {
    const o = e.currentTarget.dataset.order
    wx.navigateTo({
      url: `/pages/ordering/ordering?tableId=${o.tableId}&tableName=${o.tableName}&ticketId=${o._id}&mode=append`
    })
  },

  onCheckout(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/bill/bill?ticketId=${id}`
    })
  }
})

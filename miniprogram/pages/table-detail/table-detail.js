const { formatMoney, elapsedMinutes } = require('../../utils/format.js')
const storage = require('../../utils/storage.js')

Page({
  data: {
    tableId: '',
    tableName: '',
    tickets: []
  },

  onLoad(options) {
    this.setData({ tableId: options.tableId, tableName: options.tableName })
    wx.setNavigationBarTitle({ title: options.tableName })
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const tickets = storage.listOpenTicketsByTable(this.data.tableId).map(t => ({
      ...t,
      amount: formatMoney(t.totalAmount),
      elapsed: elapsedMinutes(t.openedAt),
      itemCount: (t.items || []).reduce((s, i) => s + i.count, 0)
    }))
    this.setData({ tickets })
    if (tickets.length === 0) {
      // 没人了，自动返回
      wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/tables/tables' }) })
    }
  },

  onAddNewParty() {
    // 同桌新一拨人 = 新建一个号
    wx.navigateTo({
      url: `/pages/ordering/ordering?tableId=${this.data.tableId}&tableName=${this.data.tableName}&mode=new`
    })
  },

  onContinue(e) {
    const ticket = e.currentTarget.dataset.ticket
    wx.navigateTo({
      url: `/pages/ordering/ordering?tableId=${this.data.tableId}&tableName=${this.data.tableName}&ticketId=${ticket._id}&mode=append`
    })
  },

  onCheckout(e) {
    const ticket = e.currentTarget.dataset.ticket
    wx.navigateTo({
      url: `/pages/bill/bill?ticketId=${ticket._id}`
    })
  },

  async onCancel(e) {
    const ticket = e.currentTarget.dataset.ticket
    const res = await wx.showModal({ title: '作废这一号？', content: `${ticket.number}号 共 ¥${ticket.amount}` })
    if (!res.confirm) return
    storage.cancelTicket(ticket._id)
    this.refresh()
  }
})

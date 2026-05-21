const { formatMoney, elapsedMinutes, startOfDay } = require('../../utils/format.js')
const storage = require('../../utils/storage.js')

Page({
  data: {
    tables: [],
    todayRevenue: 0,
    todayCount: 0,
    occupiedCount: 0
  },

  onShow() {
    this.refresh()
    this.startTick()
  },
  onHide() { this.stopTick() },
  onUnload() { this.stopTick() },

  startTick() {
    this.stopTick()
    this.timer = setInterval(() => this.refresh(), 30000)
  },
  stopTick() {
    if (this.timer) clearInterval(this.timer)
  },

  refresh() {
    const tables = storage.listTables().map(t => {
      const sum = storage.getTableSummary(t._id)
      return {
        ...t,
        ...sum,
        amount: formatMoney(sum.totalAmount),
        elapsed: sum.earliestAt ? elapsedMinutes(sum.earliestAt) : 0,
        numbersText: sum.numbers.map(n => `${n}号`).join(' · ')
      }
    })
    const occupiedCount = tables.filter(t => t.occupied).length

    const startTs = startOfDay().getTime()
    const todayPaid = storage.listTickets().filter(o => o.status === 'paid' && o.paidAt >= startTs)
    const revenue = todayPaid.reduce((s, o) => s + (o.actualAmount != null ? o.actualAmount : o.totalAmount), 0)

    this.setData({
      tables,
      occupiedCount,
      todayRevenue: formatMoney(revenue),
      todayCount: todayPaid.length
    })
  },

  onTapTable(e) {
    const t = e.currentTarget.dataset.table
    if (t.occupied) {
      // 有进行中的号 → 进桌位详情
      wx.navigateTo({
        url: `/pages/table-detail/table-detail?tableId=${t._id}&tableName=${t.name}`
      })
    } else {
      // 空桌 → 直接进点菜（开新号）
      wx.navigateTo({
        url: `/pages/ordering/ordering?tableId=${t._id}&tableName=${t.name}&mode=new`
      })
    }
  },

  async onAddTable() {
    const res = await wx.showModal({
      title: '新增桌位',
      editable: true,
      placeholderText: '如 7号桌'
    })
    if (!res.confirm || !res.content) return
    storage.addTable(res.content.trim())
    this.refresh()
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  }
})

const { formatMoney, startOfDay, startOfWeek, startOfMonth } = require('../../utils/format.js')
const storage = require('../../utils/storage.js')

Page({
  data: {
    range: 'today',
    revenue: 0,
    count: 0,
    avgPrice: 0,
    payBreakdown: [],
    topDishes: []
  },

  onShow() { this.load() },

  onSwitchRange(e) {
    this.setData({ range: e.currentTarget.dataset.range }, () => this.load())
  },

  load() {
    let from = startOfDay().getTime()
    if (this.data.range === 'week') from = startOfWeek().getTime()
    if (this.data.range === 'month') from = startOfMonth().getTime()

    const tickets = storage.listTickets().filter(o => o.status === 'paid' && o.paidAt >= from)
    const revenue = tickets.reduce((s, o) => s + (o.actualAmount != null ? o.actualAmount : o.totalAmount), 0)
    const count = tickets.length
    const avg = count ? revenue / count : 0

    const payMap = { wechat: 0, alipay: 0, cash: 0, voucher: 0 }
    tickets.forEach(o => {
      const v = o.actualAmount != null ? o.actualAmount : o.totalAmount
      if (o.payMethod && payMap[o.payMethod] != null) payMap[o.payMethod] += v
    })
    const payBreakdown = [
      { label: '微信', value: formatMoney(payMap.wechat), pct: revenue ? Math.round(payMap.wechat * 100 / revenue) : 0 },
      { label: '支付宝', value: formatMoney(payMap.alipay), pct: revenue ? Math.round(payMap.alipay * 100 / revenue) : 0 },
      { label: '现金', value: formatMoney(payMap.cash), pct: revenue ? Math.round(payMap.cash * 100 / revenue) : 0 },
      { label: '羊肉票', value: formatMoney(payMap.voucher), pct: revenue ? Math.round(payMap.voucher * 100 / revenue) : 0 }
    ]

    const dishMap = {}
    tickets.forEach(o => {
      (o.items || []).forEach(d => {
        if (!dishMap[d.name]) dishMap[d.name] = { name: d.name, count: 0, revenue: 0 }
        dishMap[d.name].count += d.count
        const addonPrice = (d.addons || []).reduce((s, a) => s + (a.price || 0), 0)
        dishMap[d.name].revenue += (d.price + addonPrice) * d.count
      })
    })
    const topDishes = Object.values(dishMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(d => ({ ...d, revenue: formatMoney(d.revenue) }))

    this.setData({
      revenue: formatMoney(revenue),
      count,
      avgPrice: formatMoney(avg),
      payBreakdown,
      topDishes
    })
  }
})

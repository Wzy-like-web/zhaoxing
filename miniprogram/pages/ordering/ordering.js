const { formatMoney } = require('../../utils/format.js')
const storage = require('../../utils/storage.js')

Page({
  data: {
    tableId: '',
    tableName: '',
    mode: 'new',          // 'new' | 'append'
    ticketId: '',         // append 模式下使用
    existingTicket: null, // append 时已有的号

    categories: [],
    activeCategory: '',
    dishes: [],
    presetNotes: [],

    // 当前购物车（本次要下单的）
    cart: [],
    cartCount: 0,
    cartAmount: 0,

    // 选配料弹层
    showAddon: false,
    currentDish: null,
    selectedAddons: [],
    selectedNotes: [],
    customNote: ''
  },

  onLoad(options) {
    this.setData({
      tableId: options.tableId,
      tableName: options.tableName,
      mode: options.mode || 'new',
      ticketId: options.ticketId || ''
    })

    let title = `${options.tableName}`
    if (options.mode === 'append' && options.ticketId) {
      const ticket = storage.getTicket(options.ticketId)
      if (ticket) {
        title = `${options.tableName} · ${ticket.number}号 加菜`
        this.setData({ existingTicket: ticket })
      }
    } else {
      title = `${options.tableName} · 新一号`
    }
    wx.setNavigationBarTitle({ title })

    this.loadDishes()
    this.setData({ presetNotes: storage.getPresetNotes() })
  },

  loadDishes() {
    const dishes = storage.listDishes().filter(d => d.status !== 'off_sale')
    const cats = []
    dishes.forEach(d => { if (!cats.includes(d.category)) cats.push(d.category) })
    this.setData({
      dishes,
      categories: cats,
      activeCategory: cats[0] || ''
    })
  },

  onSwitchCategory(e) {
    this.setData({ activeCategory: e.currentTarget.dataset.cat })
  },

  // 点菜按钮 → 弹出配料/备注层
  onPickDish(e) {
    const dish = e.currentTarget.dataset.dish
    const addonOptions = (dish.addons || []).map(a => ({ ...a, active: false }))
    const noteOptions = (this.data.presetNotes || []).map(n => ({ name: n, active: false }))
    this.setData({
      showAddon: true,
      currentDish: dish,
      addonOptions,
      noteOptions,
      selectedAddons: [],
      selectedNotes: [],
      customNote: ''
    })
  },

  toggleAddon(e) {
    const idx = e.currentTarget.dataset.idx
    const opts = [...this.data.addonOptions]
    opts[idx] = { ...opts[idx], active: !opts[idx].active }
    const selected = opts.filter(o => o.active).map(o => ({ name: o.name, price: o.price }))
    this.setData({ addonOptions: opts, selectedAddons: selected })
  },

  toggleNote(e) {
    const idx = e.currentTarget.dataset.idx
    const opts = [...this.data.noteOptions]
    opts[idx] = { ...opts[idx], active: !opts[idx].active }
    const selected = opts.filter(o => o.active).map(o => o.name)
    this.setData({ noteOptions: opts, selectedNotes: selected })
  },

  onCustomNoteInput(e) {
    this.setData({ customNote: e.detail.value })
  },

  closeAddon() {
    this.setData({ showAddon: false })
  },

  // 加入订单（决策 4 = B：每次 1 份；要 2 份多点几次或在购物车里再点）
  onConfirmAddon() {
    const dish = this.data.currentDish
    if (!dish) return
    const item = {
      dishId: dish._id,
      name: dish.name,
      price: dish.price,
      addons: this.data.selectedAddons,
      notes: this.data.selectedNotes,
      customNote: (this.data.customNote || '').trim(),
      count: 1
    }
    this.addCartItem(item)
    this.setData({ showAddon: false })
    wx.vibrateShort({ type: 'light' })
  },

  addCartItem(item) {
    const key = this.itemKey(item)
    const cart = [...this.data.cart]
    const idx = cart.findIndex(c => this.itemKey(c) === key)
    if (idx >= 0) cart[idx].count += item.count
    else cart.push(item)
    this.refreshCart(cart)
  },

  itemKey(it) {
    const a = (it.addons || []).map(x => x.name).sort().join('|')
    const n = (it.notes || []).slice().sort().join('|')
    return `${it.dishId}::${a}::${n}::${it.customNote || ''}`
  },

  // 购物车里的减/加
  onSubInCart(e) {
    const idx = e.currentTarget.dataset.idx
    const cart = [...this.data.cart]
    cart[idx].count -= 1
    if (cart[idx].count <= 0) cart.splice(idx, 1)
    this.refreshCart(cart)
  },

  onAddInCart(e) {
    const idx = e.currentTarget.dataset.idx
    const cart = [...this.data.cart]
    cart[idx].count += 1
    this.refreshCart(cart)
  },

  refreshCart(cart) {
    let count = 0
    let amount = 0
    cart.forEach(i => {
      count += i.count
      const addonPrice = (i.addons || []).reduce((s, a) => s + (a.price || 0), 0)
      amount += (i.price + addonPrice) * i.count
    })
    this.setData({ cart, cartCount: count, cartAmount: formatMoney(amount) })
  },

  showCartSheet() {
    if (this.data.cart.length === 0) {
      wx.showToast({ title: '还没加菜', icon: 'none' })
      return
    }
    this.setData({ showCart: true })
  },

  hideCartSheet() {
    this.setData({ showCart: false })
  },

  // 提交：创建新一号 或 给老号加菜
  onSubmit() {
    if (this.data.cart.length === 0) {
      wx.showToast({ title: '请先加菜', icon: 'none' })
      return
    }
    let ticket
    if (this.data.mode === 'append' && this.data.ticketId) {
      ticket = storage.appendToTicket(this.data.ticketId, this.data.cart)
    } else {
      ticket = storage.createTicket({
        tableId: this.data.tableId,
        tableName: this.data.tableName,
        items: this.data.cart
      })
    }
    if (ticket) {
      wx.showToast({ title: `${ticket.number}号 已下单`, icon: 'success' })
      // 跳到出单（打印）页
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/print/print?ticketId=${ticket._id}&newItems=${encodeURIComponent(JSON.stringify(this.data.cart))}`
        })
      }, 600)
    } else {
      wx.showToast({ title: '失败', icon: 'error' })
    }
  }
})

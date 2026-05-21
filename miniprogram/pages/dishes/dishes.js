const storage = require('../../utils/storage.js')

Page({
  data: {
    dishes: [],
    showForm: false,
    editing: null,
    form: { name: '', price: '', category: '', desc: '', image: '', addons: [] },
    newAddonName: '',
    newAddonPrice: ''
  },

  onShow() { this.load() },

  load() {
    const dishes = storage.listDishes().slice().sort((a, b) => (a.category || '').localeCompare(b.category || ''))
    this.setData({ dishes })
  },

  showAdd() {
    this.setData({
      showForm: true,
      editing: null,
      form: { name: '', price: '', category: '', desc: '', image: '', addons: [] },
      newAddonName: '',
      newAddonPrice: ''
    })
  },

  showEdit(e) {
    const dish = e.currentTarget.dataset.dish
    this.setData({
      showForm: true,
      editing: dish._id,
      form: {
        name: dish.name || '',
        price: dish.price || '',
        category: dish.category || '',
        desc: dish.desc || '',
        image: dish.image || '',
        addons: (dish.addons || []).map(a => ({ ...a }))
      },
      newAddonName: '',
      newAddonPrice: ''
    })
  },

  closeForm() {
    this.setData({ showForm: false })
  },

  onField(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  onNewAddonName(e) {
    this.setData({ newAddonName: e.detail.value })
  },

  onNewAddonPrice(e) {
    this.setData({ newAddonPrice: e.detail.value })
  },

  addAddon() {
    const name = (this.data.newAddonName || '').trim()
    if (!name) {
      wx.showToast({ title: '请输入配料名', icon: 'none' })
      return
    }
    const price = Number(this.data.newAddonPrice) || 0
    const addons = [...this.data.form.addons, { name, price }]
    this.setData({
      'form.addons': addons,
      newAddonName: '',
      newAddonPrice: ''
    })
  },

  removeAddon(e) {
    const idx = e.currentTarget.dataset.idx
    const addons = [...this.data.form.addons]
    addons.splice(idx, 1)
    this.setData({ 'form.addons': addons })
  },

  save() {
    const f = this.data.form
    if (!f.name || !f.price || !f.category) {
      wx.showToast({ title: '请填完信息', icon: 'none' })
      return
    }
    const data = {
      name: f.name,
      price: Number(f.price),
      category: f.category,
      desc: f.desc || '',
      image: f.image || '',
      addons: f.addons || [],
      status: 'on_sale'
    }
    if (this.data.editing) {
      storage.updateDish(this.data.editing, data)
    } else {
      storage.addDish(data)
    }
    this.setData({ showForm: false })
    this.load()
  },

  toggleStatus(e) {
    const dish = e.currentTarget.dataset.dish
    const next = dish.status === 'on_sale' ? 'off_sale' : 'on_sale'
    storage.updateDish(dish._id, { status: next })
    this.load()
  },

  async remove(e) {
    const res = await wx.showModal({ title: '删除菜品？', content: '此操作不可撤销' })
    if (!res.confirm) return
    storage.removeDish(e.currentTarget.dataset.id)
    this.load()
  }
})

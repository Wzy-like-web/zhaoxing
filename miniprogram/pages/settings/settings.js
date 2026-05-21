const storage = require('../../utils/storage.js')

Page({
  data: {
    showImport: false,
    importText: '',
    showExport: false,
    exportText: '',
    stats: null,
    presetNotes: [],
    newNote: ''
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    this.setData({
      stats: {
        dishes: storage.listDishes().length,
        tables: storage.listTables().length,
        tickets: storage.listTickets().length
      },
      presetNotes: storage.getPresetNotes()
    })
  },

  onNewNote(e) {
    this.setData({ newNote: e.detail.value })
  },

  addNote() {
    const note = (this.data.newNote || '').trim()
    if (!note) return
    if (this.data.presetNotes.includes(note)) {
      wx.showToast({ title: '已存在', icon: 'none' })
      return
    }
    const arr = [...this.data.presetNotes, note]
    storage.setPresetNotes(arr)
    this.setData({ presetNotes: arr, newNote: '' })
  },

  removeNote(e) {
    const note = e.currentTarget.dataset.note
    const arr = this.data.presetNotes.filter(n => n !== note)
    storage.setPresetNotes(arr)
    this.setData({ presetNotes: arr })
  },

  onExport() {
    const json = storage.exportAll()
    this.setData({ showExport: true, exportText: json })
  },

  onCopy() {
    wx.setClipboardData({ data: this.data.exportText })
  },

  onSaveFile() {
    const json = this.data.exportText
    const ts = new Date()
    const name = `backup_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.json`
    const filePath = `${wx.env.USER_DATA_PATH}/${name}`
    const fs = wx.getFileSystemManager()
    fs.writeFile({
      filePath,
      data: json,
      encoding: 'utf8',
      success: () => {
        wx.shareFileMessage({
          filePath,
          fileName: name,
          fail: () => {
            wx.showModal({
              title: '已保存',
              content: `文件路径：${filePath}`,
              showCancel: false
            })
          }
        })
      },
      fail: () => wx.showToast({ title: '保存失败', icon: 'error' })
    })
  },

  closeExport() {
    this.setData({ showExport: false })
  },

  onImport() {
    this.setData({ showImport: true, importText: '' })
  },

  onImportInput(e) {
    this.setData({ importText: e.detail.value })
  },

  async onConfirmImport() {
    if (!this.data.importText.trim()) {
      wx.showToast({ title: '请粘贴数据', icon: 'none' })
      return
    }
    const res = await wx.showModal({
      title: '确认恢复？',
      content: '当前数据将被覆盖，建议先导出当前数据'
    })
    if (!res.confirm) return
    const r = storage.importAll(this.data.importText)
    if (r.success) {
      wx.showToast({ title: '恢复成功', icon: 'success' })
      this.setData({ showImport: false })
      this.refresh()
    } else {
      wx.showToast({ title: 'JSON 格式错误', icon: 'error' })
    }
  },

  closeImport() {
    this.setData({ showImport: false })
  },

  goPrinter() {
    wx.navigateTo({ url: '/pages/printer-setup/printer-setup' })
  },

  async onPickFile() {
    try {
      const res = await wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['json']
      })
      const filePath = res.tempFiles[0].path
      const fs = wx.getFileSystemManager()
      const content = fs.readFileSync(filePath, 'utf8')
      this.setData({ importText: content })
      wx.showToast({ title: '已读取，确认恢复', icon: 'none' })
    } catch (e) {}
  },

  async onClearAll() {
    const res = await wx.showModal({
      title: '清空所有数据？',
      content: '所有菜品、桌位、订单、备注都会被删除',
      confirmText: '清空',
      confirmColor: '#e74c3c'
    })
    if (!res.confirm) return
    const res2 = await wx.showModal({
      title: '再次确认',
      content: '真的要清空吗？',
      confirmText: '我确定',
      confirmColor: '#e74c3c'
    })
    if (!res2.confirm) return
    storage.clearAll()
    storage.ensureSeedData()
    wx.showToast({ title: '已重置' })
    this.refresh()
  }
})

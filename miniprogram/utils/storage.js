// 本地存储抽象层
// 未来可平滑切换到云端：把这里的实现换成网络请求即可，业务代码不动

const KEY_DISHES = 'DISHES'
const KEY_TABLES = 'TABLES'
const KEY_TICKETS = 'TICKETS'
const KEY_PRESET_NOTES = 'PRESET_NOTES'
const KEY_DAILY_COUNTER = 'DAILY_COUNTER'  // { dayKey, last }

function genId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
}

function readList(key) {
  return wx.getStorageSync(key) || []
}

function writeList(key, list) {
  wx.setStorageSync(key, list)
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------- dishes ----------
function listDishes() {
  return readList(KEY_DISHES)
}

function getDish(id) {
  return readList(KEY_DISHES).find(i => i._id === id)
}

function addDish(data) {
  const list = readList(KEY_DISHES)
  const item = {
    _id: genId(),
    addons: [],
    ...data,
    createdAt: Date.now()
  }
  list.push(item)
  writeList(KEY_DISHES, list)
  return item
}

function updateDish(id, data) {
  const list = readList(KEY_DISHES)
  const idx = list.findIndex(i => i._id === id)
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...data }
    writeList(KEY_DISHES, list)
  }
}

function removeDish(id) {
  const list = readList(KEY_DISHES).filter(i => i._id !== id)
  writeList(KEY_DISHES, list)
}

// ---------- tables ----------
function listTables() {
  return readList(KEY_TABLES).slice().sort((a, b) => a.name.localeCompare(b.name))
}

function addTable(name) {
  const list = readList(KEY_TABLES)
  const item = { _id: genId(), name }
  list.push(item)
  writeList(KEY_TABLES, list)
  return item
}

function removeTable(id) {
  writeList(KEY_TABLES, readList(KEY_TABLES).filter(t => t._id !== id))
}

function getTable(id) {
  return readList(KEY_TABLES).find(i => i._id === id)
}

// ---------- preset notes ----------
function getPresetNotes() {
  return wx.getStorageSync(KEY_PRESET_NOTES) || []
}

function setPresetNotes(arr) {
  wx.setStorageSync(KEY_PRESET_NOTES, arr)
}

// ---------- daily counter（号码全店流水递增，每日归零）----------
function nextNumber() {
  const today = todayKey()
  let counter = wx.getStorageSync(KEY_DAILY_COUNTER) || { dayKey: today, last: 0 }
  if (counter.dayKey !== today) counter = { dayKey: today, last: 0 }
  counter.last += 1
  wx.setStorageSync(KEY_DAILY_COUNTER, counter)
  return counter.last
}

// ---------- tickets ----------
function listTickets() {
  return readList(KEY_TICKETS)
}

function getTicket(id) {
  return readList(KEY_TICKETS).find(t => t._id === id)
}

function listOpenTicketsByTable(tableId) {
  return readList(KEY_TICKETS)
    .filter(t => t.tableId === tableId && t.status === 'open')
    .sort((a, b) => a.openedAt - b.openedAt)
}

function listOpenTicketsAll() {
  return readList(KEY_TICKETS)
    .filter(t => t.status === 'open')
    .sort((a, b) => a.openedAt - b.openedAt)
}

function _saveTicket(ticket) {
  const list = readList(KEY_TICKETS)
  const idx = list.findIndex(t => t._id === ticket._id)
  if (idx >= 0) list[idx] = ticket
  else list.push(ticket)
  writeList(KEY_TICKETS, list)
}

function _calcItemPrice(item) {
  const addonPrice = (item.addons || []).reduce((s, a) => s + (a.price || 0), 0)
  return (item.price + addonPrice) * item.count
}

function _calcTotal(items) {
  return items.reduce((s, i) => s + _calcItemPrice(i), 0)
}

// 创建新一号（同桌但是新一拨人）
function createTicket({ tableId, tableName, items }) {
  const ticket = {
    _id: genId(),
    number: nextNumber(),
    dayKey: todayKey(),
    tableId,
    tableName,
    items,
    totalAmount: _calcTotal(items),
    status: 'open',
    actualAmount: null,
    payMethod: null,
    openedAt: Date.now(),
    paidAt: null,
    updatedAt: Date.now()
  }
  _saveTicket(ticket)
  return ticket
}

// 给已有的号继续加菜（合并）
function appendToTicket(ticketId, newItems) {
  const ticket = getTicket(ticketId)
  if (!ticket) return null
  // 用 dishId + addons + customNote 作为合并键，完全相同的项合并数量
  const merged = mergeItems(ticket.items || [], newItems)
  ticket.items = merged
  ticket.totalAmount = _calcTotal(merged)
  ticket.updatedAt = Date.now()
  _saveTicket(ticket)
  return ticket
}

function mergeItems(oldItems, newItems) {
  const result = [...oldItems]
  newItems.forEach(n => {
    const idx = result.findIndex(o => itemKey(o) === itemKey(n))
    if (idx >= 0) result[idx].count += n.count
    else result.push({ ...n })
  })
  return result
}

function itemKey(it) {
  const addons = (it.addons || []).map(a => a.name).sort().join('|')
  const notes = (it.notes || []).slice().sort().join('|')
  return `${it.dishId}::${addons}::${notes}::${it.customNote || ''}`
}

function closeTicket({ ticketId, actualAmount, payMethod }) {
  const ticket = getTicket(ticketId)
  if (!ticket) return { success: false }
  ticket.status = 'paid'
  ticket.actualAmount = Number(actualAmount)
  ticket.payMethod = payMethod
  ticket.paidAt = Date.now()
  ticket.updatedAt = Date.now()
  _saveTicket(ticket)
  return { success: true }
}

function cancelTicket(ticketId) {
  const ticket = getTicket(ticketId)
  if (!ticket) return { success: false }
  ticket.status = 'cancelled'
  ticket.updatedAt = Date.now()
  _saveTicket(ticket)
  return { success: true }
}

// 桌位状态汇总（动态计算，不存）
function getTableSummary(tableId) {
  const open = listOpenTicketsByTable(tableId)
  const total = open.reduce((s, t) => s + t.totalAmount, 0)
  return {
    occupied: open.length > 0,
    ticketCount: open.length,
    totalAmount: total,
    numbers: open.map(t => t.number),
    earliestAt: open.length ? open[0].openedAt : null
  }
}

// ---------- 备份 / 恢复 ----------
function exportAll() {
  return JSON.stringify({
    version: 2,
    exportedAt: Date.now(),
    dishes: listDishes(),
    tables: listTables(),
    tickets: listTickets(),
    presetNotes: getPresetNotes(),
    dailyCounter: wx.getStorageSync(KEY_DAILY_COUNTER) || null
  }, null, 2)
}

function importAll(jsonStr) {
  try {
    const data = JSON.parse(jsonStr)
    if (data.dishes) writeList(KEY_DISHES, data.dishes)
    if (data.tables) writeList(KEY_TABLES, data.tables)
    if (data.tickets) writeList(KEY_TICKETS, data.tickets)
    if (data.presetNotes) setPresetNotes(data.presetNotes)
    if (data.dailyCounter) wx.setStorageSync(KEY_DAILY_COUNTER, data.dailyCounter)
    return { success: true }
  } catch (e) {
    return { success: false, message: e.message }
  }
}

function clearAll() {
  wx.removeStorageSync(KEY_DISHES)
  wx.removeStorageSync(KEY_TABLES)
  wx.removeStorageSync(KEY_TICKETS)
  wx.removeStorageSync(KEY_PRESET_NOTES)
  wx.removeStorageSync(KEY_DAILY_COUNTER)
}

// ---------- 初始化示例数据 ----------
function ensureSeedData() {
  if (listDishes().length === 0) {
    const sample = [
      {
        name: '牛肉泡馍', price: 28, category: '泡馍',
        addons: [
          { name: '加肉', price: 8 },
          { name: '加馍', price: 3 },
          { name: '多汤', price: 0 },
          { name: '少汤', price: 0 },
          { name: '加香菜', price: 0 },
          { name: '不要香菜', price: 0 }
        ]
      },
      {
        name: '羊肉泡馍', price: 32, category: '泡馍',
        addons: [
          { name: '加肉', price: 10 },
          { name: '加馍', price: 3 },
          { name: '多汤', price: 0 },
          { name: '少汤', price: 0 },
          { name: '加香菜', price: 0 },
          { name: '不要香菜', price: 0 }
        ]
      },
      {
        name: '小炒泡馍', price: 36, category: '泡馍',
        addons: [
          { name: '加肉', price: 10 },
          { name: '加辣', price: 0 },
          { name: '不要辣', price: 0 }
        ]
      },
      {
        name: '蒜香羊肉', price: 58, category: '羊肉',
        addons: [
          { name: '微辣', price: 0 },
          { name: '中辣', price: 0 },
          { name: '重辣', price: 0 },
          { name: '不要辣', price: 0 },
          { name: '加蒜', price: 0 }
        ]
      },
      {
        name: '红烧羊肉', price: 52, category: '羊肉',
        addons: [
          { name: '微辣', price: 0 },
          { name: '不要辣', price: 0 }
        ]
      },
      {
        name: '羊肉串（5串）', price: 25, category: '羊肉',
        addons: [
          { name: '加孜然', price: 0 },
          { name: '微辣', price: 0 },
          { name: '中辣', price: 0 },
          { name: '重辣', price: 0 }
        ]
      },
      {
        name: '凉皮', price: 12, category: '凉菜',
        addons: [
          { name: '多麻酱', price: 0 },
          { name: '多醋', price: 0 },
          { name: '多辣', price: 0 },
          { name: '不要辣', price: 0 }
        ]
      },
      {
        name: '凉拌黄瓜', price: 10, category: '凉菜',
        addons: [
          { name: '加蒜', price: 0 },
          { name: '不要辣', price: 0 }
        ]
      },
      {
        name: '糖蒜', price: 6, category: '凉菜',
        addons: []
      },
      {
        name: '冰峰汽水', price: 5, category: '饮品',
        addons: []
      },
      {
        name: '酸梅汤', price: 8, category: '饮品',
        addons: [
          { name: '冰镇', price: 0 },
          { name: '常温', price: 0 }
        ]
      },
      {
        name: '砖茶', price: 10, category: '饮品',
        addons: []
      }
    ]
    sample.forEach(d => addDish({ ...d, status: 'on_sale', desc: '', image: '' }))
  }
  if (listTables().length === 0) {
    ['1号桌', '2号桌', '3号桌', '4号桌', '5号桌', '6号桌'].forEach(n => addTable(n))
  }
  if (getPresetNotes().length === 0) {
    setPresetNotes(['少盐', '多醋', '不要香菜', '不要葱', '打包', '加急', '儿童份', '老人吃软一点'])
  }
}

module.exports = {
  // dishes
  listDishes, getDish, addDish, updateDish, removeDish,
  // tables
  listTables, addTable, removeTable, getTable,
  // preset notes
  getPresetNotes, setPresetNotes,
  // tickets (核心)
  listTickets, getTicket, listOpenTicketsByTable, listOpenTicketsAll,
  createTicket, appendToTicket, closeTicket, cancelTicket,
  // table summary
  getTableSummary,
  // backup
  exportAll, importAll, clearAll,
  // seed
  ensureSeedData,
  // utils
  todayKey
}

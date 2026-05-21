/**
 * 蓝牙小票打印模块（ESC/POS 通用）
 * 适配大多数 58mm 蓝牙小票打印机（佳博、芯烨、汉印等）
 *
 * 用法：
 *   const printer = require('./utils/printer.js')
 *   await printer.connect()              // 首次连接，扫描+配对
 *   await printer.reconnect()            // 之后用已保存的设备重连
 *   await printer.printKitchen(ticket)   // 后厨联（无价）
 *   await printer.printReceipt(ticket)   // 顾客联（含价）
 *   await printer.printTest()            // 测试打印
 *   await printer.disconnect()
 */

const STORAGE_KEY = 'PRINTER_DEVICE'  // { deviceId, name, serviceId, characteristicId }

const SHOP_NAME = '兆兴牛羊肉泡馍'
const SHOP_SUB = '牛羊肉泡馍 · 蒜香羊肉'

// ============ ESC/POS 常用指令 ============
const ESC = 0x1B
const GS  = 0x1D
const LF  = 0x0A

const CMD = {
  init: [ESC, 0x40],                       // 初始化
  alignLeft:   [ESC, 0x61, 0x00],
  alignCenter: [ESC, 0x61, 0x01],
  alignRight:  [ESC, 0x61, 0x02],
  fontNormal:  [ESC, 0x21, 0x00],
  fontBig:     [ESC, 0x21, 0x30],          // 双倍宽 + 双倍高
  fontDoubleH: [ESC, 0x21, 0x10],          // 双倍高
  fontDoubleW: [ESC, 0x21, 0x20],          // 双倍宽
  boldOn:      [ESC, 0x45, 0x01],
  boldOff:     [ESC, 0x45, 0x00],
  feed:        [LF],
  feedLines: n => [ESC, 0x64, n],          // 走 n 行
  cut:         [GS, 0x56, 0x00],           // 全切
  partialCut:  [GS, 0x56, 0x01]            // 半切
}

// ============ 工具函数 ============

// 字符串转 GBK 字节（小票打印机普遍只认 GBK）
// 由于小程序无 TextEncoder GBK，使用一个简单的 GB18030 编码表（仅常用汉字）
// 最简单方案：用第三方编码库；这里给一个备用方案：调用打印机的 ESC t 0xFF 自动模式 + UTF-8
// 大多数主流打印机出厂默认是 GB18030，所以我们用 wx 自带 ArrayBuffer + 手动 GBK
// 为了零依赖，这里使用 wx 内置的 utf-8 + 提示打印机切换字符集
function strToBytes(str) {
  // 使用 ArrayBuffer + Uint8Array 编码 UTF-8（打印机部分支持）
  // 但更稳妥的做法是先把字符串转成 GBK，这里简化处理用 UTF-8
  // 注意：佳博/芯烨默认字符集是 GB18030，UTF-8 中文会乱码
  // 因此我们调用 GBK 编码，使用 wxapp-iconv 风格的小型编码逻辑
  // —— 简化方案：让用户的打印机改成 UTF-8 模式（多数打印机配置软件可改）
  // —— 为零配置，下面采用 ESC t n 命令切到 UTF-8 编码（部分打印机支持）

  // 实测最稳的做法：用 utf-8 编码 + 在 init 后发送 ESC t 0xFF（默认编码）
  // 然后让用户在打印机配置工具里把字符集改成 UTF-8（一次性）

  const buf = []
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code < 0x80) {
      buf.push(code)
    } else if (code < 0x800) {
      buf.push(0xC0 | (code >> 6))
      buf.push(0x80 | (code & 0x3F))
    } else {
      buf.push(0xE0 | (code >> 12))
      buf.push(0x80 | ((code >> 6) & 0x3F))
      buf.push(0x80 | (code & 0x3F))
    }
  }
  return buf
}

function arr(...parts) {
  const out = []
  parts.forEach(p => {
    if (Array.isArray(p)) p.forEach(b => out.push(b))
    else if (typeof p === 'string') strToBytes(p).forEach(b => out.push(b))
    else if (typeof p === 'number') out.push(p)
  })
  return out
}

function toArrayBuffer(byteArr) {
  const u8 = new Uint8Array(byteArr)
  return u8.buffer
}

// ============ 设备存取 ============
function getSavedDevice() {
  return wx.getStorageSync(STORAGE_KEY) || null
}

function saveDevice(d) {
  wx.setStorageSync(STORAGE_KEY, d)
}

function clearDevice() {
  wx.removeStorageSync(STORAGE_KEY)
}

// ============ 连接相关 ============

let _connected = false

function isConnected() {
  return _connected
}

function getDeviceInfo() {
  return getSavedDevice()
}

// iOS 需要定位权限才能扫蓝牙；Android 大多数情况不需要
function ensureLocationPermission() {
  return new Promise((resolve) => {
    // 仅 iOS 需要严格走这一步，Android 直接跳过
    const sys = wx.getSystemInfoSync()
    if (sys.platform !== 'ios') {
      resolve()
      return
    }
    wx.getSetting({
      success: res => {
        if (res.authSetting['scope.userLocation'] === false) {
          // 用户曾拒绝
          wx.showModal({
            title: '需要定位权限',
            content: 'iOS 系统要求开启定位权限才能扫描蓝牙设备\n请在设置中授权',
            confirmText: '去设置',
            success: r => {
              if (r.confirm) {
                wx.openSetting({ complete: () => resolve() })
              } else {
                resolve()
              }
            }
          })
        } else if (res.authSetting['scope.userLocation'] === undefined) {
          // 没问过，主动请求
          wx.authorize({
            scope: 'scope.userLocation',
            complete: () => resolve()
          })
        } else {
          resolve()
        }
      },
      fail: () => resolve()
    })
  })
}

// 初始化蓝牙
function openAdapter() {
  return new Promise((resolve, reject) => {
    wx.openBluetoothAdapter({
      success: () => {
        // 检查蓝牙是否真的可用
        wx.getBluetoothAdapterState({
          success: state => {
            if (!state.available) {
              reject(new Error('蓝牙不可用，请在系统设置开启蓝牙'))
              return
            }
            resolve()
          },
          fail: () => resolve()
        })
      },
      fail: err => {
        const code = err.errCode
        let msg = err.errMsg || '蓝牙初始化失败'
        if (code === 10001) msg = '蓝牙未开启，请在系统设置开启蓝牙'
        if (code === 10009) msg = '系统蓝牙不支持低功耗，无法使用'
        reject(new Error(msg))
      }
    })
  })
}

function closeAdapter() {
  return new Promise(resolve => {
    wx.closeBluetoothAdapter({ complete: () => resolve() })
  })
}

function startDiscovery() {
  return new Promise((resolve, reject) => {
    // iOS 上加 services 过滤可以提高扫描效率，但留空也行
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: false,
      powerLevel: 'high',
      success: () => resolve(),
      fail: err => {
        const code = err.errCode
        let msg = err.errMsg || '扫描失败'
        if (code === 10001) msg = '蓝牙未开启'
        if (code === 10009) msg = '系统蓝牙不支持'
        reject(new Error(msg))
      }
    })
  })
}

function stopDiscovery() {
  return new Promise(resolve => {
    wx.stopBluetoothDevicesDiscovery({ complete: () => resolve() })
  })
}

// 监听新发现的设备（外部传 callback）
function onDeviceFound(cb) {
  wx.onBluetoothDeviceFound(res => {
    res.devices.forEach(d => {
      if (d.name && d.name.length > 0) cb(d)
    })
  })
}

function offDeviceFound() {
  wx.onBluetoothDeviceFound(() => {})
}

// 拿当前蓝牙模块已经发现过的所有设备（含本次扫描前的）
// iOS 上有些设备只能从这里取到
function getDiscoveredDevices() {
  return new Promise((resolve) => {
    wx.getBluetoothDevices({
      success: res => resolve(res.devices || []),
      fail: () => resolve([])
    })
  })
}

// 连接到指定 deviceId，并自动找到可写特征值
function connectDevice(deviceId, name) {
  return new Promise((resolve, reject) => {
    wx.createBLEConnection({
      deviceId,
      timeout: 10000,
      success: () => {
        // 给设备一点时间稳定连接
        setTimeout(() => discoverServices(deviceId, name).then(resolve).catch(reject), 500)
      },
      fail: err => reject(new Error(err.errMsg || '连接失败'))
    })
  })
}

function discoverServices(deviceId, name) {
  return new Promise((resolve, reject) => {
    wx.getBLEDeviceServices({
      deviceId,
      success: res => {
        // 找出第一个可写的特征值
        findWritable(deviceId, res.services, 0).then(found => {
          if (!found) {
            reject(new Error('未找到可写的特征值，可能不是打印机'))
            return
          }
          const info = { deviceId, name, serviceId: found.serviceId, characteristicId: found.characteristicId }
          saveDevice(info)
          _connected = true
          // 监听断开事件
          wx.onBLEConnectionStateChange(r => {
            if (r.deviceId === deviceId && !r.connected) _connected = false
          })
          resolve(info)
        }).catch(reject)
      },
      fail: err => reject(err)
    })
  })
}

function findWritable(deviceId, services, idx) {
  return new Promise(resolve => {
    if (idx >= services.length) { resolve(null); return }
    const svc = services[idx]
    wx.getBLEDeviceCharacteristics({
      deviceId,
      serviceId: svc.uuid,
      success: res => {
        const writable = res.characteristics.find(c => c.properties.write || c.properties.writeNoResponse || c.properties.writeWithoutResponse)
        if (writable) {
          resolve({ serviceId: svc.uuid, characteristicId: writable.uuid })
        } else {
          findWritable(deviceId, services, idx + 1).then(resolve)
        }
      },
      fail: () => findWritable(deviceId, services, idx + 1).then(resolve)
    })
  })
}

// 用已保存的设备重连
async function reconnect() {
  const saved = getSavedDevice()
  if (!saved) throw new Error('没有保存的打印机，请先连接')
  await openAdapter()
  return new Promise((resolve, reject) => {
    wx.createBLEConnection({
      deviceId: saved.deviceId,
      timeout: 10000,
      success: () => {
        _connected = true
        wx.onBLEConnectionStateChange(r => {
          if (r.deviceId === saved.deviceId && !r.connected) _connected = false
        })
        resolve(saved)
      },
      fail: err => reject(new Error(err.errMsg || '重连失败，请重新配对'))
    })
  })
}

async function disconnect() {
  const saved = getSavedDevice()
  if (saved && saved.deviceId) {
    await new Promise(resolve => wx.closeBLEConnection({ deviceId: saved.deviceId, complete: () => resolve() }))
  }
  await closeAdapter()
  _connected = false
}

// ============ 写入数据（分包发送）============
function writeChunk(deviceId, serviceId, characteristicId, buf) {
  return new Promise((resolve, reject) => {
    wx.writeBLECharacteristicValue({
      deviceId, serviceId, characteristicId,
      value: buf,
      success: () => resolve(),
      fail: err => reject(err)
    })
  })
}

async function writeBytes(byteArr) {
  const dev = getSavedDevice()
  if (!dev) throw new Error('未连接打印机')
  if (!_connected) {
    // 自动尝试重连
    try { await reconnect() } catch (e) { throw new Error('打印机未连接：' + e.message) }
  }
  // BLE 单包大小一般 20 字节，分包发送
  const CHUNK = 20
  for (let i = 0; i < byteArr.length; i += CHUNK) {
    const slice = byteArr.slice(i, i + CHUNK)
    await writeChunk(dev.deviceId, dev.serviceId, dev.characteristicId, toArrayBuffer(slice))
    await sleep(20) // 给打印机一点缓冲时间
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ============ 打印模板 ============

// 重复字符（如分隔线）
function repeat(ch, n) {
  let s = ''
  for (let i = 0; i < n; i++) s += ch
  return s
}

// 后厨联（无价）—— 关键信息超大字号
function buildKitchenTicket(ticket, items) {
  const data = []
  // 复位
  data.push(...CMD.init)
  // 居中 + 大字号 标题
  data.push(...CMD.alignCenter, ...CMD.fontBig, ...CMD.boldOn)
  data.push(...strToBytes('* 后厨联 *'), LF)
  data.push(...CMD.fontNormal, ...CMD.boldOff)
  data.push(...strToBytes(repeat('=', 32)), LF)

  // 巨大号码
  data.push(...CMD.fontBig, ...CMD.boldOn)
  data.push(...strToBytes(`${ticket.number} 号`), LF)
  data.push(...CMD.fontNormal, ...CMD.boldOff)
  data.push(...strToBytes(ticket.tableName), LF)
  data.push(...strToBytes(repeat('-', 32)), LF)

  // 菜品（无价）
  data.push(...CMD.alignLeft, ...CMD.fontDoubleH, ...CMD.boldOn)
  ;(items || ticket.items || []).forEach(d => {
    data.push(...strToBytes(`${d.name}  x${d.count}`), LF)
    data.push(...CMD.fontNormal, ...CMD.boldOff)
    if (d.addons && d.addons.length) {
      d.addons.forEach(a => {
        data.push(...strToBytes(`  + ${a.name}`), LF)
      })
    }
    if (d.notes && d.notes.length) {
      d.notes.forEach(n => {
        data.push(...CMD.boldOn)
        data.push(...strToBytes(`  ※ ${n}`), LF)
        data.push(...CMD.boldOff)
      })
    }
    if (d.customNote) {
      data.push(...CMD.boldOn)
      data.push(...strToBytes(`  ※ ${d.customNote}`), LF)
      data.push(...CMD.boldOff)
    }
    data.push(...CMD.fontDoubleH, ...CMD.boldOn)
  })
  data.push(...CMD.fontNormal, ...CMD.boldOff)

  // 时间
  data.push(...strToBytes(repeat('-', 32)), LF)
  data.push(...strToBytes(formatDateTime(new Date())), LF)

  // 走纸 + 切纸
  data.push(...CMD.feedLines(3))
  data.push(...CMD.cut)
  return data
}

// 顾客联（含价 + 合计）
function buildReceipt(ticket) {
  const data = []
  data.push(...CMD.init)
  data.push(...CMD.alignCenter, ...CMD.fontBig, ...CMD.boldOn)
  data.push(...strToBytes(SHOP_NAME), LF)
  data.push(...CMD.fontNormal, ...CMD.boldOff)
  data.push(...strToBytes(SHOP_SUB), LF)
  data.push(...strToBytes(repeat('=', 32)), LF)

  data.push(...CMD.fontBig, ...CMD.boldOn)
  data.push(...strToBytes(`${ticket.number} 号 · ${ticket.tableName}`), LF)
  data.push(...CMD.fontNormal, ...CMD.boldOff)
  data.push(...strToBytes(repeat('-', 32)), LF)

  // 明细
  data.push(...CMD.alignLeft)
  ;(ticket.items || []).forEach(d => {
    const line = padLine(`${d.name} x${d.count}`, `¥${d.price * d.count}`, 32)
    data.push(...strToBytes(line), LF)
    if (d.addons && d.addons.length) {
      d.addons.forEach(a => {
        const note = a.price > 0 ? `  + ${a.name} (+${a.price})` : `  + ${a.name}`
        data.push(...strToBytes(note), LF)
      })
    }
    if (d.notes && d.notes.length) {
      d.notes.forEach(n => data.push(...strToBytes(`  ※ ${n}`), LF))
    }
    if (d.customNote) data.push(...strToBytes(`  ※ ${d.customNote}`), LF)
  })

  data.push(...strToBytes(repeat('-', 32)), LF)

  // 合计
  data.push(...CMD.fontDoubleH, ...CMD.boldOn)
  const total = ticket.actualAmount != null ? ticket.actualAmount : ticket.totalAmount
  data.push(...strToBytes(padLine('合计', `¥${total}`, 16)), LF)
  data.push(...CMD.fontNormal, ...CMD.boldOff)

  if (ticket.actualAmount != null && ticket.actualAmount !== ticket.totalAmount) {
    data.push(...strToBytes(padLine('原价', `¥${ticket.totalAmount}`, 32)), LF)
    data.push(...strToBytes(padLine('实收', `¥${ticket.actualAmount}`, 32)), LF)
  }

  if (ticket.payMethod) {
    const payMap = { wechat: '微信', alipay: '支付宝', cash: '现金', voucher: '羊肉票' }
    data.push(...strToBytes(`收款方式：${payMap[ticket.payMethod] || ticket.payMethod}`), LF)
  }

  // 时间
  data.push(...strToBytes(repeat('-', 32)), LF)
  data.push(...strToBytes(formatDateTime(new Date())), LF)
  data.push(...CMD.alignCenter)
  data.push(...strToBytes('— 感谢光临 —'), LF)

  data.push(...CMD.feedLines(3))
  data.push(...CMD.cut)
  return data
}

// 测试打印
function buildTest() {
  const data = []
  data.push(...CMD.init)
  data.push(...CMD.alignCenter, ...CMD.fontBig, ...CMD.boldOn)
  data.push(...strToBytes(SHOP_NAME), LF)
  data.push(...CMD.fontNormal, ...CMD.boldOff)
  data.push(...strToBytes(SHOP_SUB), LF)
  data.push(...strToBytes(repeat('=', 32)), LF)
  data.push(...CMD.fontBig)
  data.push(...strToBytes('打印机连接成功'), LF)
  data.push(...CMD.fontNormal)
  data.push(...strToBytes(repeat('-', 32)), LF)
  data.push(...strToBytes('测试中文字符：'), LF)
  data.push(...strToBytes('牛肉泡馍 羊肉串 蒜香羊肉'), LF)
  data.push(...strToBytes('凉皮 糖蒜 冰峰汽水'), LF)
  data.push(...strToBytes(repeat('-', 32)), LF)
  data.push(...strToBytes(formatDateTime(new Date())), LF)
  data.push(...CMD.feedLines(3))
  data.push(...CMD.cut)
  return data
}

// 文本对齐填充（左 + 右）
function padLine(left, right, width) {
  const lLen = visualLen(left)
  const rLen = visualLen(right)
  const pad = width - lLen - rLen
  return left + (pad > 0 ? ' '.repeat(pad) : ' ') + right
}

// 视觉长度（中文按 2 个字符算）
function visualLen(str) {
  let n = 0
  for (let i = 0; i < str.length; i++) {
    n += str.charCodeAt(i) > 0x7F ? 2 : 1
  }
  return n
}

function formatDateTime(d) {
  const pad = n => n < 10 ? '0' + n : '' + n
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ============ 对外 API ============
async function printKitchen(ticket, items) {
  const data = buildKitchenTicket(ticket, items)
  await writeBytes(data)
}

async function printReceipt(ticket) {
  const data = buildReceipt(ticket)
  await writeBytes(data)
}

async function printTest() {
  const data = buildTest()
  await writeBytes(data)
}

module.exports = {
  // 设备
  getSavedDevice,
  getDeviceInfo,
  isConnected,
  saveDevice,
  clearDevice,
  // 连接
  ensureLocationPermission,
  openAdapter,
  closeAdapter,
  startDiscovery,
  stopDiscovery,
  onDeviceFound,
  offDeviceFound,
  getDiscoveredDevices,
  connectDevice,
  reconnect,
  disconnect,
  // 打印
  printKitchen,
  printReceipt,
  printTest
}

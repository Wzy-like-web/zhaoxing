function formatMoney(n) {
  if (n == null || isNaN(n)) return '0.00'
  return Number(n).toFixed(2)
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = n => n < 10 ? '0' + n : n
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function elapsedMinutes(ts) {
  if (!ts) return 0
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
}

function startOfDay(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfWeek(date = new Date()) {
  const d = startOfDay(date)
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - day)
  return d
}

function startOfMonth(date = new Date()) {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}

module.exports = {
  formatMoney,
  formatTime,
  formatDate,
  elapsedMinutes,
  startOfDay,
  startOfWeek,
  startOfMonth
}

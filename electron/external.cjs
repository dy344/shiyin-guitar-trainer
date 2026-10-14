function externalURL(value) {
  if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\//i.test(value) || Array.from(value).some(character => character.charCodeAt(0) < 32)) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.href.length > 2048) return null
    return url.href
  } catch { return null }
}
module.exports = { externalURL }

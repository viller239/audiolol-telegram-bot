'use strict'

process.on('uncaughtException', (err) => {
  console.log('uncaughtException:', err)
})

process.on('unhandledRejection', (reason, p) => {
  console.log('unhandledRejection', reason, p)
})

const path = require('path')
const fs = require('fs')
const request = require('request')
const TelegramBot = require('node-telegram-bot-api')
const data = require('./data/scrapped.json')
const fileIds = require('./data/file_ids.json')

const bot = new TelegramBot(process.env.AUDIOLOL_BOT_TOKEN, { polling: { interval: 1000 } })

function normalizeWord (word) {
  return word.toLowerCase().replace(/[[^a-z]]/g, '')
}

data.forEach((q, index) => {
  q.index = index
  q.normName = normalizeWord(q.name)
  q.normText = q.text.toLowerCase().replace(/[^\sa-z]/g, '').split(/\s+/)
})
console.log('preliminary calculations complete')

/**
 * @param {string} query
 * @param {number} limit
 * @returns {Array}
 */
function search (query, limit = 50) {
  const qWords = query.toLowerCase().replace(/[^\sa-z]/g, '').split(/\s+/).filter((x) => !!x)
  const scores = []
  data.forEach((q, index) => {
    let score = 0
    for (let w of qWords) {
      const nameIndex = q.normName.indexOf(w)
      if (nameIndex > -1) {
        score += 10 * (1 - nameIndex / q.normName.length)
      }
      for (let nt of q.normText) {
        const ntIndex = nt.indexOf(w)
        if (ntIndex > -1) {
          score += (1 - ntIndex / nt.length)
        }
      }
    }
    if (score > 0.1) {
      scores.push([index, score])
    }
  })
  return scores.sort((a, b) => b[1] - a[1]).slice(0, limit).map((x) => data[x[0]])
}

/*  CACHING FILES  */
const dumpsterChats = ['-145765036', '-148599029', '-125221386']  // that's my chats!
const defaultTimeout = 1100  // ms
let saveTm = null

function save () {
  fs.writeFileSync(path.resolve(__dirname, './data/file_ids.json'), JSON.stringify(data, null, 2), 'utf8')
  saveTm = null
}

/**
 * @param {string|number} chat
 * @param {Object} voice
 * @returns {Promise}
 */
function sendVoice (chat, voice) {
  console.log('sending voice:', chat, voice)
  return bot.sendVoice(chat, fileIds[voice.src] || request({ url: voice.src })).then((resp) => {
    fileIds[voice.src] = resp.voice.file_id || fileIds[voice.src]
    saveTm = saveTm || setTimeout(save, 10000)
  })
}

function uploadMissingAudio () {
  let timeout = defaultTimeout
  let i = 0

  function tick () {
    while (data[i] && fileIds[data[i].src]) {
      i += 1
    }
    if (i >= data.length) {
      console.log('uploading files: complete')
      return
    }
    sendVoice(dumpsterChats[i % dumpsterChats.length], data[i]).then(() => {
      i += 1
      timeout = defaultTimeout
      setTimeout(tick, timeout)
    }, (err) => {
      console.log(err)
      timeout *= 2
      setTimeout(tick, timeout)
    }).catch((err) => {
      console.log(err)
      timeout *= 2
      setTimeout(tick, timeout)
    })
  }

  tick()
}

uploadMissingAudio()

/*  INLINE QUERY  */
bot.on('inline_query', (inlineQuery) => {
  const res = search(inlineQuery.query).map((voice) => ({
    id: '' + voice.index,
    type: 'voice',
    voice_file_id: fileIds[voice.src],
    voice_duration: 5,
    title: voice.text
  }))
  bot.answerInlineQuery(inlineQuery.id, res, {
    cache_time: process.env.NODE_ENV === 'production' ? 12 * 60 * 60 : 15  // seconds
  }).then((resp) => {
    console.log('answerInlineQuery resolve:', resp)
  }, (err) => {
    console.log('answerInlineQuery reject:', err)
  }).catch((err) => {
    console.log('answerInlineQuery error:', err)
  })
})

/*  COMMAND /random  */
bot.onText(/^\s*\/random(\s(.*))?/, (msg, match) => {
  console.log(match)
  const nName = (match[2] || '').toLowerCase().replace(/\s/g, '')
  let toSend = nName.length > 0
    ? data.filter((q) => q.name.toLowerCase().indexOf(nName) > -1)
    : data
  console.log('toSend', toSend.length)
  toSend = toSend[(Math.random() * toSend.length) | 0]
  if (toSend) {
    sendVoice(msg.chat.id, toSend)
  }
})

/*  COMMAND /log  */
bot.onText(/^\s*\/log/, (msg) => {
  console.log(msg)
})

console.log('audiolol_bot started')

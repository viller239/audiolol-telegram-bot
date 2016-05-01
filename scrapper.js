'use strict'

const fs = require('fs')
const path = require('path')
const request = require('request')
const cheerio = require('cheerio')

const OUT_PATH = path.resolve(__dirname, './data/scrapped.json')

/**
 * Load all audio data for a champion
 * @param {string} name - champion name
 * @param {boolean} [alt] - load from alternative page
 * @returns {Promise.<Array>}
 */
function loadChampionQuotes (name, alt) {
  const page = alt ? 'Quotes' : 'Background'
  return new Promise((resolve, reject) => {
    request({
      url: `http://leagueoflegends.wikia.com/wiki/${name}/${page}`
    }, (err, resp, body) => {
      if (err || resp.statusCode !== 200) {
        return reject(err || resp.statusCode)
      }

      const $ = cheerio.load(body)
      const found = $('.audio-button').map((index, el) => {
        const $el = $(el)
        const $i = $el.parent().find('i')
        let res = null
        try {
          res = {
            name: name,
            text: $i.text(),
            src: 'http' + $el.find('button').attr('onclick').split('http')[1].split('ogg')[0] + 'ogg'
          }
        } catch (err) { }
        return res
      }).get().filter((x) => !!x)

      if (found.length) {
        resolve(found)
      } else {
        if (!alt) {
          resolve(loadChampionQuotes(name, true))
        } else {
          reject('nothing found on both pages', name)
        }
      }
    })
  })
}

/**
 * Load list of all champion names
 * @returns {Promise.<Array>}
 */
function loadChampionNames () {
  return new Promise((resolve, reject) => {
    request({
      url: 'http://leagueoflegends.wikia.com/wiki/List_of_champions'
    }, (err, resp, body) => {
      if (err || resp.statusCode !== 200) {
        return reject(err || resp.statusCode)
      }
      const $ = cheerio.load(body)
      const championNames = $('table.stdt tr').map((index, row) => {
        return $(row).find('td').eq(0).text().trim()
      }).get().filter((str) => !!str)
      resolve(championNames)
    })
  })
}

/**
 * Load champions -> Load all data for all champions -> Save
 * @returns {Promise}
 */
function loadEverything () {
  return loadChampionNames().then((namesList) => {
    return Promise.all(namesList.map((name) => loadChampionQuotes(name)))
  }).then((data) => {
    data = [].concat(...data)
    fs.writeFileSync(OUT_PATH, JSON.stringify(data, null, 2), 'utf8')
  })
}

loadEverything().then(() => {
  console.log('all done', arguments)
}, (err) => {
  console.log(err)
}).catch((err) => {
  console.log(err)
})

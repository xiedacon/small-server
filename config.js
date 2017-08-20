'use strict'

const { resolve } = require('path')

module.exports = {
  page: {
    index: resolve(__dirname, './public/index.html'),
    _404: resolve(__dirname, './public/404.html'),
    suffix: 'index.html'
  },
  Expires: {
    match: /^(gif|png|jpg|js|css|json)$/ig,
    maxAge: 365 * 24 * 60 * 60
  },
  Compress: {
    match: /^(gif|png|jpg|js|css|json)$/ig
  }
}

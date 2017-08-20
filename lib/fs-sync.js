'use strict'

const fs = require('fs')

Object.keys(fs).forEach((method) => {
  if (method.charCodeAt(0) < 97 ||
    method.charCodeAt(0) > 122 ||
    method.endsWith('Sync') ||
    method.indexOf('watch') >= 0 ||
    method.indexOf('Stream') >= 0 ||
    !(fs[method] instanceof Function)) return

  fs[method + 'Async'] = wrapAsync(method)
})

function wrapAsync (method) {
  return function () {
    return new Promise((resolve, reject) => {
      fs[method].call(this, ...arguments, (err, ...args) => {
        if (err) reject(err)

        if (args.length === 0) resolve()
        else if (args.length === 1) resolve(args[0])
        else resolve(args)
      })
    })
  }
}

module.exports = fs

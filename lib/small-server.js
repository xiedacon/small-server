'use strict'

const http = require('http')
const fs = require('./fs-sync')
const { resolve, extname } = require('path')
const { parse } = require('url')
const zlib = require('zlib')

const { page, Expires, Compress } = require('../config')
const mimeTypes = require('../mime.json')

module.exports = (opts) => {
  http.createServer((req, res) => {
    res.setHeader('Server', 'small-server/0.0.1')

    service(req, res)
      .catch((err) => {
        console.log(err)
      })
  }).listen(opts.port, opts.address)

  console.log(`Start Server at ${opts.address}:${opts.port}`)

  async function service (req, res) {
    // find
    let file = await resolveFile(opts.root, parse(req.url).path.slice(1))

    // cache
    if (req.headers['if-modified-since'] === file.mtime) {
      res.setHeader('Last-Modified', file.mtime)
      res.writeHead(304)
      return res.end()
    }

    // headers
    res.setHeader('Content-Type', (mimeTypes[file.extname] || 'text/plain') + '; charset=utf-8')
    res.setHeader('Last-Modified', file.mtime)
    if (file.extname.match(Expires.match)) {
      res.setHeader('Expires', file.mtime)
      res.setHeader('Cache-Control', `max-age=${Expires.maxAge}`)
    }

    // write
    let stream = fs.createReadStream(file.path)
    let acceptEncoding = req.headers['accept-encoding'] || ''
    let matched = file.extname.match(Compress.match)

    if (matched && acceptEncoding.match(/gzip\b/)) {
      res.setHeader('Content-Encoding', 'gzip')
      stream = stream.pipe(zlib.createGzip())
    } else if (matched && acceptEncoding.match(/bdeflate\b/)) {
      res.setHeader('Content-Encoding', 'bdeflate')
      stream = stream.pipe(zlib.createGzip())
    }

    if (file.path === page._404) res.writeHead(404)

    stream.pipe(res)
  }
}

// { path, extname, mtime }
async function resolveFile (root, _path) {
  let path, mtime

  if (_path === '') {
    [path, mtime] = [page.index, -1]
  } else if (_path.startsWith('../') || _path.startsWith('/')) {
    [path, mtime] = [page._404, -1]
  } else {
    [path, mtime] = await _resolveFile(root, _path).catch(() => {
      return [page._404, -1]
    })
  }

  return {
    path,
    extname: extname(path).slice(1) || 'unknown',
    mtime
  }
}

async function _resolveFile (root, _path) {
  let path = resolve(root, _path)
  let stats = await fs.statAsync(path)

  if (!stats) return
  else if (stats.isDirectory()) {
    if (_path === page.suffix) return [page._404, -1]
    return resolveFile(path, page.suffix)
  }

  return [path, new Date(stats.mtimeMs).toUTCString()]
}

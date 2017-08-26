'use strict'

const http = require('http')
const fs = require('./fs-sync')
const { resolve, extname, relative } = require('path')
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
    let file = await resolveFile(opts.root, req.url)

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

    // range support
    let { start, end } = range(req, res, file)

    if (!file.path) {
      res.writeHead(file.code)
      return res.end()
    }

    // write
    let stream = fs.createReadStream(file.path, { start, end })
    let acceptEncoding = req.headers['accept-encoding'] || ''
    let matched = file.extname.match(Compress.match)

    if (matched && acceptEncoding.match(/gzip\b/)) {
      res.setHeader('Content-Encoding', 'gzip')
      stream = stream.pipe(zlib.createGzip())
    } else if (matched && acceptEncoding.match(/bdeflate\b/)) {
      res.setHeader('Content-Encoding', 'bdeflate')
      stream = stream.pipe(zlib.createDeflate())
    }

    res.writeHead(file.code)

    stream.pipe(res)
  }
}

// { path, extname, mtime, size, code }
async function resolveFile (root, _path) {
  _path = resolve(root, decodeURIComponent(parse(_path).pathname.slice(1)))
  let relativePath = relative(root, _path)

  let path, mtime, size, code
  if (relativePath.startsWith('../') || relativePath.startsWith('/')) {
    [code, path, mtime] = [404, page._404, -1]
  } else {
    [code, path, mtime, size] = await _resolveFile(_path).catch(() => {
      return _path === root
        ? [200, page.index, -1]
        : [404, page._404, -1]
    })
  }

  return {
    path,
    extname: extname(path).slice(1) || 'unknown',
    mtime,
    size,
    code
  }
}

async function _resolveFile (path) {
  let stats = await fs.statAsync(path)

  if (stats.isDirectory()) {
    if (path.endsWith(page.suffix)) return [404, page._404, -1]
    return _resolveFile(resolve(path, page.suffix))
  }
  return [200, path, new Date(stats.mtimeMs).toUTCString(), stats.size]
}

function range (req, res, file) {
  let [start, end] = [0, file.size]
  let ranges = (req.headers['range'] || '').match(/^bytes=(\d+)-(\d*)/)

  if (ranges) {
    [, start, end] = ranges
    start = parseInt(start)
    end = parseInt(end)
    end = Number.isNaN(end) ? file.size : end

    if (Number.isNaN(start) ||
      Number.isNaN(end) ||
      end <= start ||
      end > file.size) {
      file.path = undefined
      file.code = 416
      return
    }

    res.setHeader('Content-Range', `bytes ${start}-${end - 1}/${end}`)
    res.setHeader('Content-Length', `${end - start}`)
    file.code = 206
  } else {
    res.setHeader('Accept-Ranges', 'bytes')
  }
  return { start, end }
}

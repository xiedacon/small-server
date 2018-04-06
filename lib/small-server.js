'use strict'

const http = require('http')
const fs = require('./fs-sync')
const { resolve, extname, relative } = require('path')
const { parse } = require('url')
const zlib = require('zlib')
const opn = require('opn')

const { page, Expires, Compress } = require('../config')
const mimeTypes = require('../mime.json')

module.exports = (opts) => {
  http.createServer((req, res) => {
    res.setHeader('Server', 'small-server/0.0.1')

    service(req, res)
      .catch((err) => {
        console.error(err.toString())
        res.writeHead(500)
        res.end(err.toString())
      })
  }).listen(opts.port, opts.address)

  console.log(`Start Server at http://${opts.address}:${opts.port}`)
  opn(`http://${opts.address}:${opts.port}`)

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
    range(req, res, file)

    if (!file.path) {
      res.writeHead(file.code)
      return res.end()
    }

    // write
    let stream = fs.createReadStream(file.path, { start: file.start, end: file.end })
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

  if (relativePath.startsWith('../') || relativePath.startsWith('/')) {
    _path = resolve(root, '404.html')
  }

  let [code, path, mtime, size] = await _resolveFile(_path).catch((err) => {
    if (relativePath === '' || relativePath === 'index.html') return [200, page.index, -1]
    else if (err.toString().indexOf('no such file or directory') < 0) throw err
    else return _resolve404(root)
  })

  return {
    path,
    extname: extname(path).slice(1) || 'unknown',
    mtime,
    size,
    code
  }
}

function _resolve404 (root) {
  return _resolveFile(resolve(root, '404.html')).catch((err) => {
    if (err.toString().indexOf('no such file or directory') < 0) throw err

    return [404, page._404, -1]
  })
}

async function _resolveFile (path) {
  let stats = await fs.statAsync(path)

  if (stats.isDirectory()) {
    if (path.endsWith(page.suffix)) throw new Error('no such file or directory')

    return _resolveFile(resolve(path, page.suffix))
  }

  if (path.endsWith('404.html')) {
    return [404, path, -1]
  }

  return [200, path, new Date(stats.mtimeMs).toUTCString(), stats.size]
}

function range (req, res, file) {
  let ranges = (req.headers['range'] || '').match(/^bytes=(\d+)-(\d*)/)

  if (ranges) {
    let [, start, end] = ranges
    start = parseInt(start)
    end = parseInt(end)
    end = Number.isNaN(end) ? file.size : end

    if (Number.isNaN(start) ||
      Number.isNaN(end) ||
      end <= start ||
      end > file.size) {
      file.path = undefined
      file.code = 416
      return {}
    }

    res.setHeader('Content-Range', `bytes ${start}-${end - 1}/${end}`)
    res.setHeader('Content-Length', `${end - start}`)

    Object.assign(file, {code: 206, start, end})
  } else {
    res.setHeader('Accept-Ranges', 'bytes')
  }
}

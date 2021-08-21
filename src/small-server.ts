import fs, { Stats } from 'fs'
import { isIPv6, ListenOptions } from 'net'
import { createServer, Server, IncomingMessage, ServerResponse } from 'http'
import zlib from 'zlib'
import { Readable } from 'stream'
import { URL } from 'url'
import { resolve, extname } from 'path'
import { promisify } from 'util'

import { getType } from 'mime'
import open from 'better-opn'

import { version } from './consts'

export interface Options {
  root?: string
  open?: boolean
}

const statAsync = promisify(fs.stat)

let indexStats = null as null | Stats
let _404Stats = null as null | Stats

export class SmallServer {
  private readonly root: string
  private readonly open: boolean
  private readonly server: Server

  constructor (options?: Options) {
    this.root = options?.root ?? process.cwd()
    this.open = typeof options?.open === 'boolean' ? options.open : true
    this.server = createServer((req, res) => {
      res.setHeader('Server', `small-server/${version}`)

      this.serve(req, res).catch((err) => {
        console.error(err)
        res.writeHead(500)
        res.end(String(err))
      })
    })
  }

  listen (options: ListenOptions): void {
    this.server.listen(options)

    this.server.once('listening', () => {
      const address = this.server.address()
      const addr = typeof address === 'string'
        ? address
        : (address != null)
          ? isIPv6(address.address)
            ? `[${address.address}]:${address.port}`
            : `${address.address}:${address.port}`
          : ''

      if (addr !== '') {
        console.log(`Start server at http://${addr}`)
        if (this.open) {
          open(`http://${addr}`)
        }
      } else {
        console.log('Server address is unknown, can not open it')
      }
    })
  }

  private async serve (req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(`http://127.0.0.1:3000${req.url ?? ''}`)
    if (url.pathname === '/') {
      url.pathname = '/index.html'
    }

    let file = resolve(this.root, decodeURIComponent(url.pathname.slice(1)))
    let stats = null as null | Stats
    let code = 200
    try {
      if (url.pathname === '/index.html') {
        try {
          stats = await statAsync(file)
        } catch (err) {
          if ((err as Error).message.includes('no such file or directory')) {
            file = resolve(__dirname, '../public/index.html')
            stats = indexStats = indexStats ?? await statAsync(file)
          } else {
            throw err
          }
        }
      } else {
        stats = await statAsync(file)

        if (stats.isDirectory()) {
          throw new Error('no such file or directory')
        }
      }
    } catch (err) {
      if ((err as Error).message.includes('no such file or directory')) {
        file = resolve(__dirname, '../public/404.html')
        stats = _404Stats = _404Stats ?? await statAsync(file)
        code = 404
      } else {
        throw err
      }
    }

    const ext = extname(file).slice(1)
    const mtime = stats.mtime.toUTCString()

    // cache
    if (req.headers['if-modified-since'] === mtime) {
      res.setHeader('Last-Modified', mtime)
      res.writeHead(304)
      return res.end()
    }

    // headers
    res.setHeader('Content-Type', (getType(ext) ?? 'text/plain') + '; charset=utf-8')
    res.setHeader('Last-Modified', mtime)
    if (ext.match(/^(gif|png|jpg|js|css|json)$/ig) != null) {
      res.setHeader('Expires', mtime)
      res.setHeader('Cache-Control', `max-age=${365 * 24 * 60 * 60}`)
    }

    // range support
    let start = undefined as number | undefined
    let end = undefined as number | undefined
    const ranges = (req.headers.range ?? '').match(/^bytes=(\d+)-(\d*)/)
    if (ranges !== null) {
      start = parseInt(ranges[1])
      end = parseInt(ranges[2])
      end = Number.isNaN(end) ? stats.size : end

      if (Number.isNaN(start) ||
        Number.isNaN(end) ||
        end <= start ||
        end > stats.size) {
        res.writeHead(416)
        res.end()

        return
      }

      res.setHeader('Content-Range', `bytes ${start}-${end - 1}/${end}`)
      res.setHeader('Content-Length', `${end - start}`)

      code = 206
    } else {
      res.setHeader('Accept-Ranges', 'bytes')
    }

    // write
    let stream = fs.createReadStream(file, { start, end }) as Readable
    const acceptEncoding = (req.headers['accept-encoding'] ?? '') as string
    const matched = Boolean(ext.match(/^(gif|png|jpg|js|css|json)$/ig))

    if (matched && Boolean(acceptEncoding.match(/gzip\b/))) {
      res.setHeader('Content-Encoding', 'gzip')
      stream = stream.pipe(zlib.createGzip())
    } else if (matched && Boolean(acceptEncoding.match(/bdeflate\b/))) {
      res.setHeader('Content-Encoding', 'bdeflate')
      stream = stream.pipe(zlib.createDeflate())
    }

    res.writeHead(code)

    stream.pipe(res)
  }
}

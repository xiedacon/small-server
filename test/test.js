'use strict'

const request = require('supertest')
const childProcess = require('child_process')
const { resolve } = require('path')
const fs = require('fs')
const assert = require('power-assert')

const { encoding } = { encoding: 'utf8' }
const index = fs.readFileSync(resolve(__dirname, '../public/index.html'), { encoding })
const _404 = fs.readFileSync(resolve(__dirname, '../public/404.html'), { encoding })
const server = 'http://localhost:3000'

function fork (argv = []) {
  argv.unshift('-o', 'false')

  const child = childProcess.fork(
    resolve(__dirname, '../bin/small-server'),
    argv,
    { stdio: ['ipc', 'inherit', 'inherit'] })

  process.on('exit', () => {
    child.kill()
  })

  return new Promise((resolve, reject) => setTimeout(() => resolve(child), 1000))
}

describe('small-server', function () {
  describe('test args', function () {
    let child

    afterEach(function () {
      if (child) child.kill()
    })

    it('default config', async function () {
      child = await fork()
      await request(server)
        .get('/')
        .expect(200)
        .expect(({ headers, text }) => {
          assert(headers['content-type'] === 'text/html; charset=utf-8')
          assert(index === text)
        })

      await request(server)
        .get('/test')
        .expect(404)
        .expect(({ headers, text }) => {
          assert(headers['content-type'] === 'text/html; charset=utf-8')
          assert(_404 === text)
        })
    })

    // it('-a -address', async function () {

    // }

    it('-p -port', async function () {
      child = await fork(['-p', '3001'])
      return request('http://localhost:3001')
        .get('/')
        .expect(200)
    })

    it('-r -root', async function () {
      child = await fork(['-r', resolve(__dirname, './resource')])
      await request(server)
        .get('/')
        .expect(200)
        .expect(({ text }) => {
          assert(text === "It's index.html")
        })
    })
  })

  describe('test headers', function () {
    let child

    before(async function () {
      child = await fork(['-r', resolve(__dirname, './resource')])
    })

    after(function () {
      if (child) child.kill()
    })

    it('Server', function () {
      return request(server)
        .get('/')
        .expect(200)
        .expect(({ headers }) => {
          assert(headers.server === 'small-server/0.0.1')
        })
    })

    it('Content-Type', async function () {
      await request(server)
        .get('/1.jpg')
        .expect(200)
        .expect(({ headers }) => {
          assert(headers['content-type'] === 'image/jpeg; charset=utf-8')
        })

      return request(server)
        .get('/')
        .expect(200)
        .expect(({ headers }) => {
          assert(headers['content-type'] === 'text/html; charset=utf-8')
        })
    })

    it('Last-Modified', function () {
      return request(server)
        .get('/')
        .expect(200)
        .expect(({ headers }) => {
          assert(headers['last-modified'])
        })
    })

    it('If-Modified-Since', async function () {
      let time
      await request(server)
        .get('/1.jpg')
        .expect(200)
        .expect(({ headers }) => {
          time = headers['last-modified']
        })

      return request(server)
        .get('/1.jpg')
        .set('If-Modified-Since', time)
        .expect(304)
    })

    it('Expires & Cache-Control', async function () {
      await request(server)
        .get('/')
        .expect(200)
        .expect(({ headers }) => {
          assert(!headers.expires)
          assert(!headers['cache-control'])
        })

      return request(server)
        .get('/1.jpg')
        .expect(200)
        .expect(({ headers }) => {
          assert(headers.expires)
          assert(headers['cache-control'])
        })
    })

    it('Content-Encoding', function () {
      return request(server)
        .get('/1.jpg')
        .expect(200)
        .expect(({ headers }) => {
          assert(headers['content-encoding'] === 'gzip' ||
            headers['content-encoding'] === 'bdeflate')
        })
    })

    it('Accept-Ranges', function () {
      return request(server)
        .get('/1.mp3')
        .expect(200)
        .expect(({ headers }) => {
          assert(headers['accept-ranges'])
        })
    })

    it('Content-Range & Content-Length', async function () {
      await request(server)
        .get('/1.mp3')
        .set('Range', 'bytes=10-')
        .expect(206)
        .expect(({ headers }) => {
          assert(headers['content-range'].startsWith('bytes 10-'))
          assert(headers['content-length'])
        })

      return request(server)
        .get('/1.mp3')
        .set('Range', 'bytes=10000000000-')
        .expect(416)
    })
  })
})

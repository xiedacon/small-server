# small-server

[![Build Status](https://travis-ci.org/xiedacon/small-server.svg?branch=master)](https://travis-ci.org/xiedacon/small-server)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/xiedacon/small-server/blob/master/LICENSE)

一个简单的静态资源服务器实现，可以使用在任何目录

## Usage

```
ln -s /path-to/small-server/bin/small-server ~/.local/bin/small-server
command -v small-server

在当前目录使用
small-server

在指定目录使用
small-server -r ~/root-dir
```

## API

```
  Usage: small-server [options]

  Options:

    -a, --address [value]  Address, default localhost (defaults to "localhost")
    -h, --help             Output usage information
    -p, --port <n>         Port, default 3000 (defaults to 3000)
    -r, --root [value]     Root directory to start server (defaults to cwd)
    -v, --version          Output the version number
```

## License

[MIT License](https://github.com/xiedacon/small-server/blob/master/LICENSE)

Copyright (c) 2017 xiedacon

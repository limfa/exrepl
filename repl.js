// history, independent for script
// support Promise destruction

const repl = require('repl')
const vm = require('vm')
const path = require('path')
const fs = require('fs')
const os = require('os')

const history = {
  init() {
    this.HISTORY_LENGTH = 100
    this.HISTORY_FILE = path.join(
      os.homedir(),
      '.node_repl',
      require.main.filename.replace(/[:\\/]/g, '_')
    )
    fs.mkdirSync(path.dirname(this.HISTORY_FILE), { recursive: true })
    try {
      var text = fs.readFileSync(this.HISTORY_FILE, 'utf-8')
    } catch {
      var text = ''
    }
    this.histories = text.split(/(?:\r?\n)+/g)
    if (this.histories[this.histories.length - 1].trim() === '')
      this.histories.pop()
    this.historyIndex = this.histories.length
    this._timer
  },
  put(cmd) {
    cmd = cmd.trimRight()
    let n = 0
    this.historyIndex = this.histories.length
    if (
      this.historyIndex > 0 &&
      this.histories[this.historyIndex - 1] === cmd
    ) {
      n = 1
      --this.historyIndex
    }

    this.histories.splice(this.historyIndex++, n, cmd)
    clearTimeout(this._timer)
    this._timer = setTimeout(() => {
      this.save()
    }, 500)
  },
  save() {
    let dn = this.histories.length - this.HISTORY_LENGTH
    if (dn > 0) {
      if (this.historyIndex > this.histories.length / 2) {
        this.histories.splice(0, dn)
        this.historyIndex -= dn
      } else {
        this.histories.splice(this.HISTORY_LENGTH, dn)
      }
    }
    fs.writeFileSync(this.HISTORY_FILE, this.histories.join('\n'))
  },
  up() {
    if (this.historyIndex - 1 < 0) {
      return null
    }
    return this.histories[--this.historyIndex]
  },
  down() {
    if (this.historyIndex + 1 > this.histories.length) {
      return null
    }
    ++this.historyIndex
    return this.historyIndex === this.histories.length
      ? ''
      : this.histories[this.historyIndex]
  }
}

process.on('unhandledRejection', err => {
  console.error(err.stack)
})

async function myEval(cmd, context, filename, callback) {
  cmd = `
  with (new Proxy(global, {
    async set(target, key, value, ...args) {
      value = await value
      return Reflect.set(target, key, value, ...args)
    },
    has(target, key, ...args) {
      return true
    },
    get(target, key, ...args) {
      let value = Reflect.get(target, key, ...args)
      if (typeof value === 'function') {
        return (...args) => {
          let result = value(...args)
          if (
            typeof result.then === 'function' &&
            typeof result.catch === 'function'
          ) {
            const proxy = new Proxy(result, {
              get(target, key, ...args) {
                if (key in target) {
                  return Reflect.get(target, key, ...args)
                }
                return target.then(v => v[key])
              }
            })
            proxy[Symbol.iterator] = function*() {
              let i = 0
              while (true) {
                yield result.then(v => v[i++])
              }
            }
            return proxy
          }
          return result
        }
      }
      return value
    }
  })) {
    ${cmd}
  }
  `
  try {
    let result = vm.runInContext(cmd, context)
    result = await result
    callback(null, result)
  } catch (e) {
    if (isRecoverableError(e)) {
      return callback(new repl.Recoverable(e))
    }
    callback(e)
  }
}

function isRecoverableError(error) {
  if (error.name === 'SyntaxError') {
    return /^(Unexpected end of input|Unexpected token)/.test(error.message)
  }
  return false
}

history.init()
module.exports = ({ init = () => {} } = {}) => {
  let rpl = repl.start({
    prompt: '> ',
    eval: (cmd, ...args) => {
      if (cmd.trim()) {
        history.put(cmd)
      }
      return myEval(cmd, ...args)
    },
    ignoreUndefined: true,
    historySize: 0
  })
  const keypressEvent = (char, keyData) => {
    const { name, ctrl, meta, shift } = keyData
    if (ctrl === false && meta === false && shift === false) {
      switch (name) {
        case 'up':
          var t = history.up()
          if (t != null) {
            rpl.write(null, { ctrl: true, name: 'u' })
            rpl.write(t)
          }
          break
        case 'down':
          var t = history.down()
          if (t != null) {
            rpl.write(null, { ctrl: true, name: 'u' })
            rpl.write(t)
          }
          break
      }
    }
  }
  process.stdin.on('keypress', keypressEvent)

  rpl.context.R = p => {
    if (/^\.\.?[/\\]/.test(p)) {
      p = path.join(path.dirname(require.main.filename), p)
    }
    require.cache[require.resolve(p)] = null
    return require(p)
  }
  init(rpl.context)
  rpl.on('reset', init).on('exit', () => {
    process.stdin.off('keypress', keypressEvent)
  })
}

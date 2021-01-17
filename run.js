const app = {
  debug: (msg) => console.log(msg),
  handleMessage: (id, delta) => console.log(JSON.stringify(delta, null, 2))
}

const plugin = require('./')(app)
plugin.start({
  udpPort: 7878,
  ignoreChecksum: true
})

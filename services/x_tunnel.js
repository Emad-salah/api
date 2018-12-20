const shell = require('shelljs');

class Tunnel {
  constructor() {}

  start() {
    shell.exec(`lt --port 9835`, (code, stdout, stderr) => {
      console.log('Tunnel.start(): code', code)
      console.log('Tunnel.start(): stdout', stdout)
      console.log('Tunnel.start(): stderr', stderr)
    });
  }
}
module.exports = new Tunnel();

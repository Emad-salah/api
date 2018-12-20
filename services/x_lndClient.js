const shell = require('shelljs');

class LND {
  constructor() {}

  start() {
    shell.exec(`lnd --bitcoin.active --bitcoin.testnet --debuglevel=debug --bitcoin.node=neutrino --neutrino.connect=faucet.lightning.community`, (code, stdout, stderr) => {
      console.log('lndClient code', code)
      console.log('lndClient stdout', stdout)
      console.log('lndClient stderr', stderr)
    });
  }
}
module.exports = new LND();

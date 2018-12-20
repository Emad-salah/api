let shell = require('shelljs');
let config = require('../config/config');

module.exports = () => {
  return new Promise((resolve, reject) => {
    shell.exec(`cp "${config['lndDirPath']}/admin.macaroon" "${__dirname}/admin.macaroon"`, (code, stdout, stderr) => {
      if (stderr) {
        console.log('initializer.js err', stderr);
        reject();
      } else {
        resolve();
      }
    })
  })
};

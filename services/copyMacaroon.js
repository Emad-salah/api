const fs = require('fs');

module.exports = () => {
  fs.createReadStream(config['lndDirPath']).pipe(fs.createWriteStream(__dirname + '/admin.macaroon'));
}

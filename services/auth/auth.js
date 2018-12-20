const jwt = require('jsonwebtoken');
const uuidv1 = require('uuid/v1');
const jsonfile = require('jsonfile');
let secretsFilePath = __dirname + '/secrets.json';

class Auth {
  constructor() {}

  readSecrets() {
    return new Promise((resolve, reject) => {
      jsonfile.readFile(secretsFilePath, function(err, allSecrets) {
        if (err) {
          console.log('readSecrets err', err);
          reject('Problem reading secrets file');
        } else {
          resolve(allSecrets);
        }
      })
    })
  }

  writeSecrets(key, value) {
    return this.readSecrets().then(allSecrets => {
      return new Promise((resolve, reject) => {
        allSecrets[key] = value;
        jsonfile.writeFile(secretsFilePath, allSecrets, {spaces: 2, EOL: '\r\n'}, function (err) {
          if (err) {
            console.log('writeSecrets err', err);
            reject('Problem writing secrets file');
          } else {
            resolve();
          }
        })
      });
    })
  }

  generateToken() {
    let timestamp = Date.now();
    let secret = uuidv1();
    let token = jwt.sign({
      data: {timestamp: timestamp},
    }, secret, { expiresIn: '500h' });
    return this.writeSecrets(timestamp, secret)
    .then(() => {
      return token;
    });
  };

  validateToken(token) {
    let key = jwt.decode(token).data.timestamp;
    return this.readSecrets().then(allSecrets => {
      return new Promise((resolve, reject) => {
        let secret = allSecrets[key];
        let decoded = jwt.verify(token, secret, function(err, decoded) {
          if (err) {
            console.log('validateToken err', err);
            reject(err);
          } else {
            console.log('decoded', decoded);
            resolve({valid: true});
          }
        });
      });
    })
  };

}

module.exports = new Auth();

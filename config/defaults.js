let os = require('os');
let platform = os.platform();
let homeDir = os.homedir();

let getLndDirectory = () => {
	if (platform == 'darwin') {
		return homeDir + "/Library/Application Support/Lnd";
	} else {
		return homeDir + "/.lnd"; //Windows not impplemented yet
	}
};

let lndDirectory = getLndDirectory();

module.exports = {
	serverPort: 9835,
	serverHost: "localhost",
	lndProto: __dirname + "/rpc.proto",
	lndHost: "localhost:10009",
	// lndCertPath: __dirname + "/../lnd.cert",
	// macaroonPath: __dirname + "/../admin.macaroon",
	lndCertPath: lndDirectory + "/tls.cert",
	macaroonPath: lndDirectory + "/admin.macaroon",
	dataPath: __dirname + "/../data",
	loglevel: "info",
	logfile: "lncliweb.log",
	lndLogFile: lndDirectory + "/.lnd/logs/bitcoin/testnet/lnd.log"
};

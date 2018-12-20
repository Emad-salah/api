let os = require('os');
let platform = os.platform();
let homeDir = os.homedir();

let getLndDirectory = () => {
	if (platform == 'darwin') {
		return homeDir + "/Library/Application Support/Lnd";
	} else {
		return homeDir + "/.lnd";
	}
};

let lndDirectory = getLndDirectory();

module.exports = {
	sessionSecret: "my session secret",
	sessionMaxAge: 300000,
	lndAddress: "127.0.0.1:9735",
	defaultAuthPayReq: "ymdeeamm664q4wpo56hrdiq5fhf3ai1zfz768rhwf9effzsxty9z6apseqzqfoibbb7qgh1fedt3yt6oa3dd31eucedkob4azyzxwy8syyyyyyyyyyyyne6xgrjy",
	maxNumRoutesToQuery: 20,
	lndDirPath: lndDirectory
};

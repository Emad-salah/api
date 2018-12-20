'use strict';

/**
 * Module dependencies.
 */
module.exports = (program) => {

	const express = require('express');
	const app = express();

	const fs = require("fs");
	const bodyParser = require("body-parser");         // pull information from HTML POST (express4)
	const session = require("express-session");
	const methodOverride = require("method-override"); // simulate DELETE and PUT (express4)
	// load app default configuration data
	const defaults = require("../config/defaults");
	// load other configuration data
	const config = require("../config/config");
	// define useful global variables ======================================
	module.useTLS = program.usetls;
	module.serverPort = program.serverport || defaults.serverPort;
	module.httpsPort = module.serverPort;
	module.serverHost = program.serverhost || defaults.serverHost;

	// setup winston logging ==========
	const logger = require("../config/log")((program.logfile || defaults.logfile), (program.loglevel || defaults.loglevel));

	// utilities functions =================
	const utils = require("../utils/server-utils")(module);
	const db = require("../services/database")(defaults.dataPath);

	// setup lightning client =================
	const lndHost = program.lndhost || defaults.lndHost;
	const lndCertPath = program.lndCertPath || defaults.lndCertPath;
	const macaroonPath = program.macaroonPath || defaults.macaroonPath;

	// check to see the lndDirPath exists
	// if (!fs.existsSync(config['lndDirPath'])) {
	// 	console.log(colors.error("In order to start the app you'll need to provide the path for your lnd folder. Please incldue the path in config/config.js for the value lndDirPath"));
	// 	return;
	// }
	//
	// // if we don't have the tls.cert copied over then copy it.
	// if (!fs.existsSync(__dirname + '/../lnd.cert')) {
	// 	fs.copyFileSync(config['lndDirPath'] + '/tls.cert', __dirname + '/../lnd.cert', (err) => {
	// 		if (err) {
	// 			console.log(`We were not able to copy the tls.cert from ${config['lndDirPath']}`, err);
	// 		}
	// 	});
	// }

	let lnServices;

	if (fs.existsSync(macaroonPath)) {
		lnServices = require("../services/lnd/lightning")(defaults.lndProto, lndHost, lndCertPath, macaroonPath);
	} else {
		lnServices = require("../services/lnd/lightning")(defaults.lndProto, lndHost, lndCertPath);
	}
	let lightning = lnServices.lightning;
	let walletUnlocker = lnServices.walletUnlocker;
	let lnServicesData = {
		lndProto: defaults.lndProto,
		lndHost: lndHost,
		lndCertPath: lndCertPath,
		macaroonPath: macaroonPath
	};

	// init lnd module =================
	const lnd = require("../services/lnd/lnd")(lightning);

	const unprotectedRoutes = {
		'GET': {
			'/api/lnd/connect': true
		},
		'POST': {
			'/api/lnd/connect': true,
			'/api/lnd/wallet': true
		},
		'PUT': {},
		'DELETE': {}
	};
	const auth = require('../services/auth/auth');


	app.use((req, res, next) => {

		if (unprotectedRoutes[req.method][req.path]) {
			next();
		} else {
			try {
				auth.validateToken(req.headers.authorization)
				.then(response => {
					if (response.valid) {
						next();
					} else {
						res.status(401).json({message: 'Please log in'});
					}
				})
			} catch(e) {
				res.status(401).json({message: 'Please log in'});
			}
		}
	});

	const sensitiveRoutes = {
		'GET': {},
		'POST': {
			'/api/lnd/connect': true,
			'/api/lnd/wallet': true
		},
		'PUT': {},
		'DELETE': {}
	};
	app.use((req, res, next) => {
			if (sensitiveRoutes[req.method][req.path]) {
				console.log(JSON.stringify({
					time: new Date(),
					ip: req.ip,
					method: req.method,
					path: req.path,
					sessionId: req.sessionId
				}));
			} else {
				console.log(JSON.stringify({
					time: new Date(),
					ip: req.ip,
					method: req.method,
					path: req.path,
					body: req.body,
					query: req.query,
					sessionId: req.sessionId
				}));
			}
			next();
	})
	app.use(session({ secret: config.sessionSecret, cookie: { maxAge: config.sessionMaxAge }, resave: true, rolling: true, saveUninitialized: true }));
	app.use(bodyParser.urlencoded({ extended: "true" }));           // parse application/x-www-form-urlencoded
	app.use(bodyParser.json());                                     // parse application/json
	app.use(bodyParser.json({ type: "application/vnd.api+json" })); // parse application/vnd.api+json as json
	app.use(methodOverride());
	// error handler
	app.use(function (err, req, res, next) {
		// Do logging and user-friendly error message display
		logger.error(err);
		res.status(500).send({ status: 500, message: "internal error", type: "internal" });
	});

	let server;
	if (program.usetls) {
		server = require("https").createServer({
			key: require("fs").readFileSync(program.usetls + "/key.pem"),
			cert: require("fs").readFileSync(program.usetls + "/cert.pem")
		}, app);
	} else {
		server = require("http").Server(app);
	}

	const io = require("socket.io")(server);

	// setup sockets =================
	var lndLogfile = program.lndlogfile || defaults.lndLogFile;

	let mySocketsEvents = require("./sockets")(io, lightning, lnd, program.user, program.pwd, program.limituser, program.limitpwd, lndLogfile, lnServicesData);

	const routes = require('./routes')(app, lightning, db, config, walletUnlocker, lnServicesData, mySocketsEvents);

	const swConfig = require('../sw.config.json');

	const colors = require('../utils/colors');

	if (!swConfig["lndDirPath"]) {
		console.log(colors.error("Error: In order to run the Shockwallet server you'll need to fill out the sw.config.json file in the root directory"));
		return;
	}

	app.use(require("./cors"));                                     // enable CORS headers
	// app.use(bodyParser.json({limit: '100000mb'}));
	app.use(bodyParser.json({limit: '50mb'}));
	app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

	server.listen(module.serverPort, module.serverHost);

	logger.info("App listening on " + module.serverHost + " port " + module.serverPort);

	module.server = server;

	// const localtunnel = require('localtunnel');
	//
	// const tunnel = localtunnel(port, (err, t) => {
	// 	console.log('err', err);
	// 	console.log('t', t.url);
	// });

};

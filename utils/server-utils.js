module.exports = function (server) {

	var module = {};

	server.getURL = function () {
		return "http" + (this.useTLS ? "s" : "") + "://" + this.serverHost
			+ (this.useTLS
				? ((this.httpsPort === "443") ? "" : ":" + this.httpsPort)
				: ((this.serverPort === "80") ? "" : ":" + this.serverPort));
	};

	return module;
};

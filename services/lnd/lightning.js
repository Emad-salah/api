const grpc = require("grpc");
const protoLoader = require("@grpc/proto-loader");
const protoFiles = require("google-proto-files");
const fs = require("fs");
const logger = require("winston");
const debug = require("debug")("lncliweb:lightning");

// expose the routes to our app with module.exports
module.exports = async (protoPath, lndHost, lndCertPath, macaroonPath) => {
  process.env.GRPC_SSL_CIPHER_SUITES = "HIGH+ECDSA";

  const packageDefinition = await protoLoader.load(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: ["node_modules/google-proto-files", "proto"]
  });
  const { lnrpc } = grpc.loadPackageDefinition(packageDefinition);

  if (lndCertPath) {
    if (fs.existsSync(lndCertPath)) {
      const lndCert = fs.readFileSync(lndCertPath);
      const sslCreds = grpc.credentials.createSsl(lndCert);

      let credentials;
      if (macaroonPath) {
        if (fs.existsSync(macaroonPath)) {
          const macaroonCreds = grpc.credentials.createFromMetadataGenerator(
            (args, callback) => {
              const adminMacaroon = fs.readFileSync(macaroonPath);
              const metadata = new grpc.Metadata();
              metadata.add("macaroon", adminMacaroon.toString("hex"));
              callback(null, metadata);
            }
          );
          credentials = grpc.credentials.combineChannelCredentials(
            sslCreds,
            macaroonCreds
          );
        } else {
          logger.error(
            'The specified macaroon file "' +
              macaroonPath +
              '" was not found.\n' +
              "Please add the missing lnd macaroon file or update/remove the path in the application configuration."
          );
          process.exit(1);
        }
      } else {
        credentials = sslCreds;
      }

      const lightning = new lnrpc.Lightning(lndHost, credentials);
      const walletUnlocker = new lnrpc.WalletUnlocker(lndHost, credentials);

      return {
        lightning,
        walletUnlocker
      };
    } else {
      logger.error(
        'The specified lnd certificate file "' +
          lndCertPath +
          '" was not found.\n' +
          "Please add the missing lnd certificate file or update the path in the application configuration."
      );
      process.exit(1);
    }
  } else {
    logger.error(
      "Required lnd certificate path missing from application configuration."
    );
    process.exit(1);
  }
};

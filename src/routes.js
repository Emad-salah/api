"use strict";

// app/routes.js

const debug = require("debug")("lncliweb:routes");
const logger = require("winston");
const request = require("request");
const graphviz = require("graphviz");
const commandExistsSync = require("command-exists").sync;
const auth = require("../services/auth/auth");
const rp = require("request-promise");
const jsonfile = require("jsonfile");

const DEFAULT_MAX_NUM_ROUTES_TO_QUERY = 10;

let channel_point;
// module.exports = (app) => {
module.exports = (
  app,
  lightning,
  db,
  config,
  walletUnlocker,
  lnServicesData,
  mySocketsEvents
) => {
  const checkHealth = () => {
    return new Promise((resolve, reject) => {
      lightning.getInfo({}, function(err, response) {
        if (err) {
          console.log(`Synched to chain: false`);
          resolve({ connectedToLnd: false });
        } else {
          console.log(`Synched to chain: ${response.synced_to_chain}`);
          resolve({ connectedToLnd: true });
        }
      });
    });
  };

  const handleError = async (res, err) => {
    const health = await checkHealth();
    if (health.connectedToLnd) {
      if (err) {
        res.send({
          error: err.message.split(": ")[1]
        });
      } else {
        res.sendStatus(403);
      }
    } else {
      res.status(500);
      res.send({ errorMessage: "LND is down" });
    }
  };

  /**
   * health check
   */
  app.get("/health", async (req, res) => {
    console.log(lightning);
    const health = await checkHealth();
    res.send(health);
  });

  app.get("/api/lnd/connect", (req, res) => {
    res.status(200);
    res.json({});
  });

  app.post("/api/mobile/error", (req, res) => {
    console.log(JSON.stringify(req.body));
    res.json({ msg: OK });
  });

  app.get("/api/lnd/auth", (req, res) => {
    checkHealth().then(healthResponse => {
      // IF WE ARE CONNECTED TO LND THEN RETURN AN AUTH TOKEN.
      if (healthResponse.connectedToLnd) {
        auth.generateToken().then(token => {
          res.json({
            authorization: token
          });
        });
      } else {
        res.status(500);
        res.send({ errorMessage: "LND is down" });
      }
    });
  });

  let recreateLnServices = (callback, cs) => {
    cs();

    let lnServices = require("../services/lnd/lightning")(
      lnServicesData.lndProto,
      lnServicesData.lndHost,
      lnServicesData.lndCertPath,
      lnServicesData.macaroonPath
    );
    lightning = lnServices.lightning;
    walletUnlocker = lnServices.walletUnlocker;

    if (callback) {
      setTimeout(() => {
        callback();
      }, 3000);
    }
    return;
  };

  app.post("/api/lnd/connect", (req, res) => {
    let args = {
      wallet_password: Buffer.from(req.body.password, "utf-8")
    };

    lightning.getInfo({}, function(err, response) {
      if (err) {
        // try to unlock wallet
        recreateLnServices(
          () => {
            walletUnlocker.unlockWallet(args, function(
              unlockErr,
              unlockResponse
            ) {
              if (unlockErr) {
                console.log("unlock Error:", unlockErr);
                logger.debug("unlock Error:", unlockErr);
                unlockErr.error = unlockErr.message;
                console.log("unlockErr.message", unlockErr.message);
                return checkHealth().then(healthResponse => {
                  if (healthResponse.connectedToLnd) {
                    let errorMessage = unlockErr.details;
                    res.status(400);
                    res.send({ errorMessage: unlockErr.message });
                  } else {
                    res.status(500);
                    res.send({ errorMessage: "LND is down" });
                  }
                });
              } else {
                recreateLnServices(
                  () => {
                    mySocketsEvents.emit("updateLightning");
                    return auth.generateToken().then(token => {
                      res.json({
                        authorization: token
                      });
                    });
                  },
                  () => console.log("second")
                );
              }
            });
          },
          () => console.log("first")
        );
      } else {
        return auth.generateToken().then(token => {
          res.json({
            authorization: token
          });
        });
      }
    });
  });

  app.post("/api/lnd/wallet", (req, res) => {
    let mnemonicPhrase;
    console.log("Request received!");
    walletUnlocker.genSeed({}, function(genSeedErr, genSeedResponse) {
      console.log(genSeedErr, genSeedResponse);
      if (genSeedErr) {
        logger.debug("GenSeed Error:", genSeedErr);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            genSeedErr.error = genSeedErr.message;
            let errorMessage = genSeedErr.details;
            res.status(400);
            res.send({ errorMessage: errorMessage });
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        logger.debug("GenSeed:", genSeedResponse);
        mnemonicPhrase = genSeedResponse.cipher_seed_mnemonic;
        let walletArgs = {
          wallet_password: Buffer.from(req.body.password, "utf8"),
          cipher_seed_mnemonic: mnemonicPhrase
        };
        walletUnlocker.initWallet(walletArgs, function(
          initWalletErr,
          initWalletResponse
        ) {
          if (initWalletErr) {
            console.log("initWallet Error:", initWalletErr.message);
            console.log(
              "initWallet Error:",
              Object.keys(initWalletErr.message)
            );
            return checkHealth().then(healthResponse => {
              if (healthResponse.connectedToLnd) {
                let errorMessage = initWalletErr.details;
                logger.debug("initWallet Error:", initWalletErr);
                initWalletErr.error = initWalletErr.message;
                res.status(400);
                res.send({ errorMessage: errorMessage });
              } else {
                res.status(500);
                res.send({ errorMessage: "LND is down" });
              }
            });
          } else {
            logger.debug("initWallet:", initWalletResponse);

            const fs = require("fs");
            let dirPath = config["lndDirPath"];

            const waitUntilFileExists = seconds => {
              console.log(
                `Waiting for admin.macaroon to be created. Seconds passed: ${seconds}`
              );
              setTimeout(() => {
                // if (!fs.existsSync(dirPath + '/admin.macaroon')) {
                if (!fs.existsSync(lnServicesData.macaroonPath)) {
                  return waitUntilFileExists(seconds + 1);
                } else {
                  mySocketsEvents.emit("updateLightning");
                  let lnServices = require("../services/lnd/lightning")(
                    lnServicesData.lndProto,
                    lnServicesData.lndHost,
                    lnServicesData.lndCertPath,
                    lnServicesData.macaroonPath
                  );
                  lightning = lnServices.lightning;
                  walletUnlocker = lnServices.walletUnlocker;
                  return auth.generateToken().then(token => {
                    res.json({
                      mnemonicPhrase: mnemonicPhrase,
                      authorization: token
                    });
                  });
                }
              }, 1000);
            };

            waitUntilFileExists(1);
          }
        });
      }
    });
  });

  app.get("/api/static/profiles", (req, res) => {
    let options = {
      method: "GET",
      uri: "http://static.shock.network:8020/profiles"
    };
    return rp(options)
      .then(function(profiles) {
        // [req.method][req.path]
        res.json({ profiles: JSON.parse(profiles) });
      })
      .catch(function(err) {
        console.log("err", err);
        res.json({
          yee: ":("
        });
      });
  });

  app.put("/api/static/profile", (req, res) => {
    lightning.getInfo({}, function(err, response) {
      if (err) {
        console.log("GetInfo Error:", err);
      } else {
        let file = __dirname + "/../data/profile.json";
        let profile = {
          name: req.body.name,
          bio: req.body.bio,
          avatar: req.body.avatar
        };
        jsonfile.writeFile(file, profile, function(err) {
          console.error(err);
        });
        if (!req.body.isPublic) {
          res.json({
            yee: ":("
          });
          return;
        }
        console.log("sending profile to static");
        let options = {
          method: "PUT",
          uri: "http://static.shock.network:8020/profiles",
          body: {
            nodePubKey: response.identity_pubkey,
            name: req.body.name,
            bio: req.body.bio,
            avatar: req.body.avatar
          },
          json: true // Automatically stringifies the body to JSON
        };
        return rp(options)
          .then(function(parsedBody) {
            res.json({
              yee: ":)"
            });
          })
          .catch(function(err) {
            console.log("err", err);
            res.json({
              yee: ":("
            });
          });
      }
    });
  });

  // get lnd info
  app.get("/api/lnd/getinfo", (req, res) => {
    console.log(lightning.estimateFee);
    lightning.getInfo({}, function(err, response) {
      if (err) {
        console.log("GetInfo Error:", err);
        logger.debug("GetInfo Error:", err);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            err.error = err.message;
            res.send(err);
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        console.log("GetInfo:", response);
        logger.debug("GetInfo:", response);
        if (!response.uris || response.uris.length === 0) {
          if (config.lndAddress) {
            response.uris = [
              response.identity_pubkey + "@" + config.lndAddress
            ];
          }
        }
        res.json(response);
      }
    });
  });

  // get lnd node info
  app.post("/api/lnd/getnodeinfo", (req, res) => {
    lightning.getNodeInfo({ pub_key: req.body.pubkey }, function(
      err,
      response
    ) {
      if (err) {
        logger.debug("GetNodeInfo Error:", err);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            err.error = err.message;
            res.send(err);
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        logger.debug("GetNodeInfo:", response);
        res.json(response);
      }
    });
  });

  app.get("/api/lnd/getnetworkinfo", (req, res) => {
    lightning.getNetworkInfo({}, function(err, response) {
      if (err) {
        logger.debug("GetNetworkInfo Error:", err);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            err.error = err.message;
            res.send(err);
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        logger.debug("GetNetworkInfo:", response);
        res.json(response);
      }
    });
  });

  // get lnd node active channels list
  app.get("/api/lnd/listpeers", (req, res) => {
    lightning.listPeers({}, function(err, response) {
      if (err) {
        logger.debug("ListPeers Error:", err);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            err.error = err.message;
            res.send(err);
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        logger.debug("ListPeers:", response);
        res.json(response);
      }
    });
  });

  // newaddress
  app.post("/api/lnd/newaddress", (req, res) => {
    lightning.newAddress({ type: req.body.type }, function(err, response) {
      if (err) {
        logger.debug("NewAddress Error:", err);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            err.error = err.message;
            res.send(err);
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        logger.debug("NewAddress:", response);
        res.json(response);
      }
    });
  });

  // connect peer to lnd node
  app.post("/api/lnd/connectpeer", (req, res) => {
    if (req.limituser) {
      return checkHealth().then(healthResponse => {
        if (healthResponse.connectedToLnd) {
          return res.sendStatus(403); // forbidden
        } else {
          res.status(500);
          res.send({ errorMessage: "LND is down" });
        }
      });
    } else {
      var connectRequest = {
        addr: { pubkey: req.body.pubkey, host: req.body.host },
        perm: true
      };
      logger.debug("ConnectPeer Request:", connectRequest);
      lightning.connectPeer(connectRequest, function(err, response) {
        if (err) {
          logger.debug("ConnectPeer Error:", err);
          err.error = err.message;
          res.send(err);
        } else {
          logger.debug("ConnectPeer:", response);
          res.json(response);
        }
      });
    }
  });

  // disconnect peer from lnd node
  app.post("/api/lnd/disconnectpeer", (req, res) => {
    if (req.limituser) {
      return checkHealth().then(healthResponse => {
        if (healthResponse.connectedToLnd) {
          return res.sendStatus(403); // forbidden
        } else {
          res.status(500);
          res.send({ errorMessage: "LND is down" });
        }
      });
    } else {
      var disconnectRequest = { pub_key: req.body.pubkey };
      logger.debug("DisconnectPeer Request:", disconnectRequest);
      lightning.disconnectPeer(disconnectRequest, function(err, response) {
        if (err) {
          logger.debug("DisconnectPeer Error:", err);
          err.error = err.message;
          res.send(err);
        } else {
          logger.debug("DisconnectPeer:", response);
          res.json(response);
        }
      });
    }
  });

  // get lnd node opened channels list
  app.get("/api/lnd/listchannels", (req, res) => {
    lightning.listChannels({}, function(err, response) {
      if (err) {
        logger.debug("ListChannels Error:", err);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            err.error = err.message;
            res.send(err);
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        logger.debug("ListChannels:", response);
        res.json(response);
      }
    });
  });

  // get lnd node pending channels list
  app.get("/api/lnd/pendingchannels", (req, res) => {
    lightning.pendingChannels({}, function(err, response) {
      if (err) {
        logger.debug("PendingChannels Error:", err);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            err.error = err.message;
            res.send(err);
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        logger.debug("PendingChannels:", response);
        res.json(response);
      }
    });
  });

  // get lnd node payments list
  app.get("/api/lnd/listpayments", (req, res) => {
    lightning.listPayments({}, function(err, response) {
      if (err) {
        logger.debug("ListPayments Error:", err);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            err.error = err.message;
            res.send(err);
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        logger.debug("ListPayments:", response);
        res.json(response);
      }
    });
  });

  // get lnd node invoices list
  app.get("/api/lnd/listinvoices", (req, res) => {
    lightning.listInvoices({}, function(err, response) {
      if (err) {
        logger.debug("ListInvoices Error:", err);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            err.error = err.message;
            res.send(err);
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        logger.debug("ListInvoices:", response);
        res.json(response);
      }
    });
  });

  // get lnd node forwarding history
  app.get("/api/lnd/forwardinghistory", (req, res) => {
    lightning.forwardingHistory({}, function(err, response) {
      if (err) {
        logger.debug("ForwardingHistory Error:", err);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            err.error = err.message;
            res.send(err);
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        logger.debug("ForwardingHistory:", response);
        res.json(response);
      }
    });
  });

  // get the lnd node wallet balance
  app.get("/api/lnd/walletbalance", (req, res) => {
    lightning.walletBalance({}, function(err, response) {
      if (err) {
        logger.debug("WalletBalance Error:", err);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            err.error = err.message;
            res.send(err);
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        logger.debug("WalletBalance:", response);
        res.json(response);
      }
    });
  });

  // get the lnd node channel balance
  app.get("/api/lnd/channelbalance", (req, res) => {
    lightning.channelBalance({}, function(err, response) {
      if (err) {
        logger.debug("ChannelBalance Error:", err);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            err.error = err.message;
            res.send(err);
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        logger.debug("ChannelBalance:", response);
        res.json(response);
      }
    });
  });

  app.get("/api/lnd/channelbalance", (req, res) => {
    lightning.channelBalance({}, function(err, response) {
      if (err) {
        logger.debug("ChannelBalance Error:", err);
        return checkHealth().then(healthResponse => {
          if (healthResponse.connectedToLnd) {
            err.error = err.message;
            res.send(err);
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        });
      } else {
        logger.debug("ChannelBalance:", response);
        res.json(response);
      }
    });
  });

  // openchannel
  app.post("/api/lnd/openchannel", (req, res) => {
    if (req.limituser) {
      return checkHealth().then(healthResponse => {
        if (healthResponse.connectedToLnd) {
          res.sendStatus(403); // forbidden
        } else {
          res.status(500);
          res.send({ errorMessage: "LND is down" });
        }
      });
    } else {
      var openChannelRequest = {
        node_pubkey_string: req.body.pubkey,
        local_funding_amount: 500000,
        push_sat: 50000
      };
      console.log("OpenChannelRequest", openChannelRequest);
      logger.debug("OpenChannelRequest", openChannelRequest);
      lightning.openChannelSync(openChannelRequest, function(err, response) {
        if (err) {
          console.log("OpenChannelRequest Error:", err);
          logger.debug("OpenChannelRequest Error:", err);
          return checkHealth().then(healthResponse => {
            if (healthResponse.connectedToLnd) {
              err.error = err.message;
              res.send(err);
            } else {
              res.status(500);
              res.send({ errorMessage: "LND is down" });
            }
          });
        } else {
          console.log("OpenChannelRequest:", response);
          channel_point = response;
          logger.debug("OpenChannelRequest:", response);
          res.json(response);
        }
      });
    }
  });

  // closechannel
  app.post("/api/lnd/closechannel", (req, res) => {
    if (req.limituser) {
      return checkHealth().then(healthResponse => {
        if (healthResponse.connectedToLnd) {
          // return res.sendStatus(403); // forbidden
          res.sendStatus(403); // forbidden
        } else {
          res.status(500);
          res.send({ errorMessage: "LND is down" });
        }
      });
    } else {
      var closeChannelRequest = {
        channel_point: {
          funding_txid_bytes: "",
          funding_txid_str: "",
          output_index: ""
        },
        force: true
      };
      console.log("CloseChannelRequest", closeChannelRequest);
      logger.debug("CloseChannelRequest", closeChannelRequest);
      lightning.closeChannel(closeChannelRequest, function(err, response) {
        if (err) {
          console.log("CloseChannelRequest Error:", err);
          return checkHealth().then(healthResponse => {
            if (healthResponse.connectedToLnd) {
              logger.debug("CloseChannelRequest Error:", err);
              err.error = err.message;
              res.send(err);
            } else {
              res.status(500);
              res.send({ errorMessage: "LND is down" });
            }
          });
        } else {
          console.log("CloseChannelRequest:", response);
          logger.debug("CloseChannelRequest:", response);
          res.json(response);
        }
      });
    }
  });

  // sendpayment
  app.post("/api/lnd/sendpayment", (req, res) => {
    if (req.limituser) {
      return checkHealth().then(healthResponse => {
        if (healthResponse.connectedToLnd) {
          res.sendStatus(403); // forbidden
        } else {
          res.status(500);
          res.send({ errorMessage: "LND is down" });
        }
      });
    } else {
      var paymentRequest = { payment_request: req.body.payreq };
      if (req.body.amt) {
        paymentRequest.amt = req.body.amt;
      }
      logger.debug("Sending payment", paymentRequest);
      lightning.sendPaymentSync(paymentRequest, function(err, response) {
        if (err) {
          logger.debug("SendPayment Error:", err);
          return checkHealth().then(healthResponse => {
            if (healthResponse.connectedToLnd) {
              err.error = err.message;
              res.send(err);
            } else {
              res.status(500);
              res.send({ errorMessage: "LND is down" });
            }
          });
        } else {
          logger.debug("SendPayment:", response);
          res.json(response);
        }
      });
    }
  });

  // addinvoice
  app.post("/api/lnd/addinvoice", (req, res) => {
    if (req.limituser) {
      return checkHealth().then(healthResponse => {
        if (healthResponse.connectedToLnd) {
          res.sendStatus(403); // forbidden
        } else {
          res.status(500);
          res.send({ errorMessage: "LND is down" });
        }
      });
    } else {
      var invoiceRequest = { memo: req.body.memo };
      if (req.body.value) {
        invoiceRequest.value = req.body.value;
      }
      if (req.body.expiry) {
        invoiceRequest.expiry = req.body.expiry;
      }
      lightning.addInvoice(invoiceRequest, function(err, response) {
        if (err) {
          logger.debug("AddInvoice Error:", err);
          return checkHealth().then(healthResponse => {
            if (healthResponse.connectedToLnd) {
              err.error = err.message;
              res.send(err);
            } else {
              res.status(500);
              res.send({ errorMessage: "LND is down" });
            }
          });
        } else {
          logger.debug("AddInvoice:", response);
          res.json(response);
        }
      });
    }
  });

  // signmessage
  app.post("/api/lnd/signmessage", (req, res) => {
    if (req.limituser) {
      return checkHealth().then(healthResponse => {
        if (healthResponse.connectedToLnd) {
          res.sendStatus(403); // forbidden
        } else {
          res.status(500);
          res.send({ errorMessage: "LND is down" });
        }
      });
    } else {
      lightning.signMessage(
        { msg: Buffer.from(req.body.msg, "utf8") },
        function(err, response) {
          if (err) {
            logger.debug("SignMessage Error:", err);
            return checkHealth().then(healthResponse => {
              if (healthResponse.connectedToLnd) {
                err.error = err.message;
                res.send(err);
              } else {
                res.status(500);
                res.send({ errorMessage: "LND is down" });
              }
            });
          } else {
            logger.debug("SignMessage:", response);
            res.json(response);
          }
        }
      );
    }
  });

  // verifymessage
  app.post("/api/lnd/verifymessage", (req, res) => {
    lightning.verifyMessage(
      { msg: Buffer.from(req.body.msg, "utf8"), signature: req.body.signature },
      function(err, response) {
        if (err) {
          logger.debug("VerifyMessage Error:", err);
          return checkHealth().then(healthResponse => {
            if (healthResponse.connectedToLnd) {
              err.error = err.message;
              res.send(err);
            } else {
              res.status(500);
              res.send({ errorMessage: "LND is down" });
            }
          });
        } else {
          logger.debug("VerifyMessage:", response);
          res.json(response);
        }
      }
    );
  });

  // sendcoins
  app.post("/api/lnd/sendcoins", (req, res) => {
    if (req.limituser) {
      return checkHealth().then(healthResponse => {
        if (healthResponse.connectedToLnd) {
          res.sendStatus(403); // forbidden
        } else {
          res.status(500);
          res.send({ errorMessage: "LND is down" });
        }
      });
    } else {
      var sendCoinsRequest = { addr: req.body.addr, amount: req.body.amount };
      logger.debug("SendCoins", sendCoinsRequest);
      lightning.sendCoins(sendCoinsRequest, function(err, response) {
        if (err) {
          logger.debug("SendCoins Error:", err);
          return checkHealth().then(healthResponse => {
            if (healthResponse.connectedToLnd) {
              err.error = err.message;
              res.send(err);
            } else {
              res.status(500);
              res.send({ errorMessage: "LND is down" });
            }
          });
        } else {
          logger.debug("SendCoins:", response);
          res.json(response);
        }
      });
    }
  });

  // queryroute
  app.post("/api/lnd/queryroute", (req, res) => {
    var numRoutes =
      config.maxNumRoutesToQuery || DEFAULT_MAX_NUM_ROUTES_TO_QUERY;
    lightning.queryRoutes(
      { pub_key: req.body.pubkey, amt: req.body.amt, num_routes: numRoutes },
      function(err, response) {
        if (err) {
          logger.debug("QueryRoute Error:", err);
          return checkHealth().then(healthResponse => {
            if (healthResponse.connectedToLnd) {
              err.error = err.message;
              res.send(err);
            } else {
              res.status(500);
              res.send({ errorMessage: "LND is down" });
            }
          });
        } else {
          logger.debug("QueryRoute:", response);
          res.json(response);
        }
      }
    );
  });

  app.post("/api/lnd/estimatefee", (req, res) => {
    const { amount, confirmationBlocks } = req.body;
    lightning.estimateFee(
      {
        AddrToAmount: {
          tb1qnpq3vj8p6jymah6nnh6wz3p333tt360mq32dtt: amount
        },
        target_conf: confirmationBlocks
      },
      async (err, fee) => {
        if (err) {
          const health = await checkHealth();
          if (health.connectedToLnd) {
            res.send({
              error: err.message
            });
          } else {
            res.status(500);
            res.send({ errorMessage: "LND is down" });
          }
        } else {
          logger.debug("EstimateFee:", fee);
          res.json(fee);
        }
      }
    );
  });

  app.post("/api/lnd/listunspent", (req, res) => {
    const { minConfirmations = 3, maxConfirmations = 6 } = req.body;
    lightning.listUnspent(
      {
        min_confs: minConfirmations,
        max_confs: maxConfirmations
      },
      async (err, unspent) => {
        if (err) {
          return handleError(res, err);
        } else {
          logger.debug("ListUnspent:", unspent);
          res.json(unspent);
        }
      }
    );
  });

  app.get("/api/lnd/transactions", (req, res) => {
    lightning.getTransactions({}, async (err, transactions) => {
      if (err) {
        return handleError(res, err);
      } else {
        logger.debug("Transactions:", transactions);
        res.json(transactions);
      }
    });
  });

  app.post("/api/lnd/sendmany", (req, res) => {
    const { addresses } = req.body;
    lightning.sendMany(
      { AddrToAmount: addresses },
      async (err, transactions) => {
        if (err) {
          return handleError(res, err);
        } else {
          logger.debug("Transactions:", transactions);
          res.json(transactions);
        }
      }
    );
  });

  app.get("/api/lnd/closedchannels", (req, res) => {
    const { closeTypeFilters = [] } = req.query;
    const lndFilters = closeTypeFilters.reduce(
      (filters, filter) => ({ ...filters, [filter]: true }),
      {}
    );
    lightning.closedChannels(lndFilters, async (err, channels) => {
      if (err) {
        return handleError(res, err);
      } else {
        logger.debug("Channels:", channels);
        res.json(channels);
      }
    });
  });

  app.post("/api/lnd/exportchanbackup", (req, res) => {
    const { channelPoint } = req.body;
    lightning.exportChannelBackup(
      { chan_point: { funding_txid_str: channelPoint } },
      async (err, backup) => {
        if (err) {
          return handleError(res, err);
        } else {
          logger.debug("ExportChannelBackup:", backup);
          res.json(backup);
        }
      }
    );
  });

  app.post("/api/lnd/exportallchanbackups", (req, res) => {
    lightning.exportAllChannelBackups({}, async (err, channelBackups) => {
      if (err) {
        return handleError(res, err);
      } else {
        logger.debug("ExportAllChannelBackups:", channelBackups);
        res.json(channelBackups);
      }
    });
  });

  /**
   * Return app so that it can be used by express.
   */
  // return app;
};

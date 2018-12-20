const EventEmitter = require('events');
const fs = require("fs");

module.exports = (lightning, mobileWSConnection, lnServicesData) => {

  class StaticClientEvents extends EventEmitter {}

  const staticClientEvents = new StaticClientEvents();

  staticClientEvents.on('updateLightning', () => {
    console.log('staticClientEvents.on(updateLightning)');
    let lnServices;

    if (fs.existsSync(lnServicesData.macaroonPath)) {
      lnServices = require("../lnd/lightning")(lnServicesData.lndProto, lnServicesData.lndHost, lnServicesData.lndCertPath, lnServicesData.macaroonPath);
    } else {
      lnServices = require("../lnd/lightning")(lnServicesData.lndProto, lnServicesData.lndHost, lnServicesData.lndCertPath);
    }
    lightning = lnServices.lightning;
    
    registerSocketListeners();
  });

  const io = require('socket.io-client');
  const socket = io('http://static.shock.network:8020');

  let identity_pubkey = null;

  let registerSocketListeners = () => {
    console.log('registering Socket Listeners')
    register();
    registerAck();

    invoiceRequest(); // receive a request for invoice;
    invoiceRequestAck(); // response to invoice request;

    newInvoice(); // receive a new invoice;
    // newInvoiceAck(); // response to invoice;

    mobileRequestsInvoice();
  };

  let register = () => {
    // call lightning to get wallet id;
    lightning.getInfo({}, function (err, response) {
			if (err) {
				console.log("GetInfo Error:", err);
			} else {
				console.log("GetInfo:", response);
        identity_pubkey = response.identity_pubkey;
        socket.emit("register", {
          walletId: response.identity_pubkey
        });
			}
		});
  };

  // this tells us we have registered our pubkey with static.
  let registerAck = () => {
    socket.on('registerAck', (data) => {
      console.log('registerAck', data);
    });
  };

  // if someone wants an invoice from us we listen for invoiceRequest.
  // if we want one, the socket connection with the moile app will
  // listen for a request and using the socket emit
  // an event to static service called requestInvoice
  //
  // A emits 'requestInvoice' to Static
  // B listens for 'invoiceRequest' from Static
  // B emits 'invoice' to Static
  // Static listens for 'invoice' from B
  // Static emits 'invoice' to A
  // A listens for 'invoice' from Static
  let invoiceRequest = () => {
    // call lightning to generate invoice
    socket.on('invoiceRequest', (data) => {
      console.log('invoiceRequest', data);

      // connect to user to verify message
      // once connected
      // we need to verify the message before we create the invoice;


      lightning.addInvoice({value: 123, memo: `invoice requested from ${data.recipient}`}, function(err, response) {
        response['recipient'] = data.recipient;
        response['sender'] = identity_pubkey;
        console.log('AddInvoice: ' + JSON.stringify(response));
        socket.emit("invoice", response);
      });
    });
  };

  let invoiceRequestAck = () => {
    socket.on('invoiceRequestAck', (data) => {
      console.log('invoiceRequestAck', data);
    });
  };

  let newInvoice = () => {
    // console.log('newInvoice');
    // when we receive an invoice, send it to the mobile client;

    // connect to verify message.
    // we need to verify the invoice is valid before we send it
    // out.

    socket.on('invoice', (data) => {
      console.log('invoice received', data);
      mobileWSConnection.emit("invoice", {
        data: data
      });
    });
  };

  // this registers an event on the socket between
  // mobile app and shock service.
  let mobileRequestsInvoice = () => {
    // we need to sign the message before we send it out.

		mobileWSConnection.on('requestInvoice', (data) => {
      console.log('data', data);
			socket.emit('requestInvoice', {
				value: data.value,
				memo: data.memo,
				recipient: data.recipient,
        sender: identity_pubkey
			})
		});
	};

  socket.on('connect', () => {
    /** pushing new client to client array*/
    // socket = socket;
    /** listening if client has disconnected */
    registerSocketListeners();
  });

  socket.on("disconnect", () => {
    client = null;
  });

  return staticClientEvents;
};

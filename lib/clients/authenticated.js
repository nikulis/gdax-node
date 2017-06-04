const util = require('util');
const signRequest = require('../../lib/request_signer').signRequest;
const request = require('request');
const async = require('async');

const PublicClient = require('./public.js');

class AuthenticatedClient extends PublicClient {
  constructor(key, b64secret, passphrase, apiURI) {
    super('', apiURI);
    this.key = key;
    this.b64secret = b64secret;
    this.passphrase = passphrase;
  }

  request(method, uriParts, opts = {}, callback) {
    if (!callback && typeof opts === 'function') {
      callback = opts;
      opts = {};
    }

    if (!callback) throw new Error('Must supply a callback');

    const relativeURI = this.makeRelativeURI(uriParts);
    method = method.toUpperCase();
    Object.assign(opts, {
      method: method,
      uri: this.makeAbsoluteURI(relativeURI)
    });

    this.addHeaders(opts, this._getSignature(method, relativeURI, opts));
    request(opts, this.makeRequestCallback(callback));
  }

  _getSignature(method, relativeURI, opts) {
    const auth = {
      key: this.key,
      secret: this.b64secret,
      passphrase: this.passphrase
    };
    const sig = signRequest(auth, method, relativeURI, opts);

    if (opts.body) opts.body = JSON.stringify(opts.body);
    return {
      'CB-ACCESS-KEY': sig.key,
      'CB-ACCESS-SIGN': sig.signature,
      'CB-ACCESS-TIMESTAMP': sig.timestamp,
      'CB-ACCESS-PASSPHRASE': sig.passphrase
    };
  }

  getAccounts(callback) {
    return this.get(['accounts'], callback);
  }

  getAccount(accountID, callback) {
    return this.get(['accounts', accountID], callback);
  }

  getAccountHistory(accountID, args = {}, callback) {
    if (!callback && typeof args === 'function') {
      callback = args;
      args = {};
    }

    return this.get(['accounts', accountID, 'ledger'], { qs: args }, callback);
  }

  getAccountHolds(accountID, args = {}, callback) {
    if (!callback && typeof args === 'function') {
      callback = args;
      args = {};
    }

    return this.get(['accounts', accountID, 'holds'], { qs: args }, callback);
  }

  _placeOrder(params, callback) {
    let requiredParams = ['size', 'side', 'product_id'];

    if (params.type !== 'market') requiredParams.push('price');

    this._requireParams(params, requiredParams);

    return this.post(['orders'], { body: params }, callback);
  }

  buy(params, callback) {
    params.side = 'buy';
    return this._placeOrder(params, callback);
  }

  sell(params, callback) {
    params.side = 'sell';
    return this._placeOrder(params, callback);
  }

  getTrailingVolume(callback) {
    return this.get(['users', 'self', 'trailing-volume'], {}, callback);
  }

  cancelOrder(orderID, callback) {
    if (!callback && typeof orderID === 'function') {
      callback = orderID;
      callback(new Error('must provide an orderID or consider cancelOrders'));
      return;
    }

    return this.delete(['orders', orderID], callback);
  }

  cancelOrders(callback) {
    return this.delete(['orders'], callback);
  }

  // temp over ride public call to get Product Orderbook
  getProductOrderBook(args = {}, productId, callback) {
    if (!callback && typeof args === 'function') {
      callback = args;
      args = {};
    }

    return this.get(['products', productId, 'book'], { qs: args }, callback);
  }

  cancelAllOrders(args = {}, callback) {
    if (!callback && typeof args === 'function') {
      callback = args;
      args = {};
    }

    const opts = { qs: args };

    let currentDeletedOrders = [];
    let totalDeletedOrders = [];
    let query = true;
    let response;

    async.doWhilst(deleteOrders.bind(this), untilEmpty, completed);

    function deleteOrders(done) {
      this.delete(['orders'], opts, function(err, resp, data) {
        if (err) {
          done(err);
          return;
        }

        if ((resp && resp.statusCode != 200) || !data) {
          var error = new Error('Failed to cancel all orders');
          query = false;
          done(error);
          return;
        }

        currentDeletedOrders = data;
        totalDeletedOrders = totalDeletedOrders.concat(currentDeletedOrders);
        response = resp;

        done();
      });
    }

    function untilEmpty() {
      return currentDeletedOrders.length > 0 && query;
    }

    function completed(err) {
      callback(err, response, totalDeletedOrders);
    }
  }

  getOrders(args = {}, callback) {
    if (!callback && typeof args === 'function') {
      callback = args;
      args = {};
    }

    return this.get(['orders'], { qs: args }, callback);
  }

  getOrder(orderID, callback) {
    if (!callback && typeof orderID === 'function') {
      callback = orderID;
      callback(new Error('must provide an orderID or consider getOrders'));
      return;
    }

    return this.get(['orders', orderID], callback);
  }

  getFills(args = {}, callback) {
    if (!callback && typeof args === 'function') {
      callback = args;
      args = {};
    }

    return this.get(['fills'], { qs: args }, callback);
  }

  getFundings(callback) {
    return this.get(['funding'], callback);
  }

  repay(params, callback) {
    this._requireParams(params, ['amount', 'currency']);
    return this.post(['funding/repay'], { body: params }, callback);
  }

  marginTransfer(params, callback) {
    this._requireParams(params, [
      'margin_profile_id',
      'type',
      'currency',
      'amount'
    ]);
    return this.post(['profiles/margin-transfer'], { body: params }, callback);
  }

  closePosition(params, callback) {
    this._requireParams(params, ['repay_only']);
    return this.post(['position/close'], { body: params }, callback);
  }

  deposit(params, callback) {
    params.type = 'deposit';
    return this._transferFunds(params, callback);
  }

  withdraw(params, callback) {
    params.type = 'withdraw';
    return this._transferFunds(params, callback);
  }

  _transferFunds(params, callback) {
    this._requireParams(params, ['type', 'amount', 'coinbase_account_id']);
    return this.post(['transfers'], { body: params }, callback);
  }

  _requireParams(params, required) {
    for (let param of required) {
      if (params[param] === undefined)
        throw new Error('`opts` must include param `' + param + '`');
    }
    return true;
  }
}

module.exports = exports = AuthenticatedClient;

const { Readable } = require('stream');
const agent = require('superagent-use')(require('superagent'));
const agentPrefix = require('superagent-prefix');

class PublicClient {
  constructor(productID = 'BTC-USD', apiURI = 'https://api.gdax.com') {
    agent.use(agentPrefix(apiURI));

    this._productID = productID;
    this._API_LIMIT = 100;
  }

  _get(args) {
    return this._request(Object.assign({ method: 'get' }, args));
  }
  _put(args) {
    return this._request(Object.assign({ method: 'put' }, args));
  }
  _post(args) {
    return this._request(Object.assign({ method: 'post' }, args));
  }
  _delete(args) {
    return this._request(Object.assign({ method: 'delete' }, args));
  }

  _requestParamsToObj(...args) {
    if (args.length == 1 && typeof args[0] == 'object') return args[0];

    let obj = {};
    ['uri', 'queries', 'headers', 'body', 'callback'].forEach((param, i) => {
      obj[param] = args[i];
    });
    return obj;
  }

  _request({
    method,
    uri,
    queries = {},
    headers = {},
    body = {},
    callback = () => {},
  }) {
    method = method.toLowerCase();

    let request = agent
      [method](uri)
      .set('User-Agent', 'gdax-node-client')
      .query(queries)
      .accept('json');

    for (let h in headers) {
      request = request.set(h, headers[h]);
    }

    if (method == 'put' || method == 'post') {
      request = request.type('json').send(body);
    }

    return request
      .then(response => {
        callback(undefined, response.body);
        return response.body;
      })
      .catch(error => {
        callback(error);
        throw error;
      });
  }

  getProducts(callback) {
    return this._get({ uri: '/products', callback });
  }

  getProductOrderBook(args = {}, callback) {
    if (!callback && typeof args === 'function') {
      callback = args;
      args = {};
    }

    return this._get({
      uri: `/products/${this._productID}/book`,
      queries: args,
      callback,
    });
  }

  getProductTicker(callback) {
    return this._get({ uri: `/products/${this._productID}/ticker`, callback });
  }

  getProductTrades(args = {}, callback) {
    if (!callback && typeof args === 'function') {
      callback = args;
      args = {};
    }
    return this._get({
      uri: `/products/${this._productID}/trades`,
      queries: args,
      callback,
    });
  }

  getProductTradeStream(tradesFrom, tradesTo) {
    let stopFn = () => false;

    if (typeof tradesTo === 'function') {
      stopFn = tradesTo;
      tradesTo = Infinity;
    }

    const stream = new Readable({ objectMode: true });
    let started = false;

    stream._read = () => {
      if (!started) {
        started = true;
        fetchTrades.call(this, tradesFrom, tradesTo);
      }
    };

    return stream;

    function fetchTrades(tradesFrom, tradesTo) {
      let after = tradesFrom + this._API_LIMIT + 1;

      if (tradesTo < after) after = tradesTo;

      let opts = { before: tradesFrom, after: after, limit: this._API_LIMIT };

      this.getProductTrades(opts)
        .then(data => {
          let trade;

          while (data.length) {
            trade = data.pop();
            trade.trade_id = parseInt(trade.trade_id);

            if (stopFn(trade)) {
              stream.push(null);
              return;
            }

            if (trade.trade_id >= tradesTo - 1) {
              stream.push(trade);
              stream.push(null);
              return;
            }

            stream.push(trade);
          }

          fetchTrades.call(this, trade.trade_id, tradesTo);
        })
        .catch(err => stream.emit('error', err));
    }
  }

  getProductHistoricRates(args = {}, callback) {
    if (!callback && typeof args === 'function') {
      callback = args;
      args = {};
    }
    return this._get({
      uri: `/products/${this._productID}/candles`,
      queries: args,
      callback,
    });
  }

  getProduct24HrStats(callback) {
    return this._get({ uri: `/products/${this._productID}/stats`, callback });
  }

  getCurrencies(callback) {
    return this._get({ uri: '/currencies', callback });
  }

  getTime(callback) {
    return this._get({ uri: '/time', callback });
  }
}

module.exports = exports = PublicClient;

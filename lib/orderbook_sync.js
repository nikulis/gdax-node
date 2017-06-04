const WebsocketClient = require('./clients/websocket.js');
const PublicClient = require('./clients/public.js');
const Orderbook = require('./orderbook.js');
const Utils = require('./utilities.js');

// Orderbook syncing
class OrderbookSync extends WebsocketClient {
  constructor(
    productIDs,
    apiURI = 'https://api.gdax.com',
    websocketURI = 'wss://ws-feed.gdax.com',
    authenticatedClient
  ) {
    productIDs = Utils.determineProductIDs(productIDs);
    super(productIDs, websocketURI);
    this.productIDs = productIDs;
    this.authenticatedClient = authenticatedClient;

    this._queues = {}; // []
    this._sequences = {}; // -1
    this._public_clients = {};
    this.books = {};

    this.productIDs.forEach(productID => {
      this._queues[productID] = [];
      this._sequences[productID] = -1;
      this.books[productID] = new Orderbook();
      this.loadOrderbook(productID);
    });
  }

  onMessage(data) {
    data = JSON.parse(data);
    this.emit('message', data);

    const { product_id } = data;

    if (this._sequences[product_id] === -1) {
      // Orderbook snapshot not loaded yet
      this._queues[product_id].push(data);
    } else {
      this.processMessage(data);
    }
  }

  loadOrderbook(productID) {
    const bookLevel = 3;
    const args = { level: bookLevel };

    if (this.authenticatedClient) {
      this.authenticatedClient.getProductOrderBook(args, productID, cb);
    } else {
      if (!this._public_clients[productID]) {
        this._public_clients[productID] = new PublicClient(
          productID,
          this.apiURI
        );
      }
      this._public_clients[productID].getProductOrderBook(args, cb.bind(this));
    }

    function cb(err, response, body) {
      if (err) {
        throw new Error('Failed to load orderbook: ' + err);
      }

      if (response.statusCode !== 200) {
        throw new Error('Failed to load orderbook: ' + response.statusCode);
      }

      if (!this.books[productID]) {
        return;
      }

      const data = JSON.parse(response.body);
      this.books[productID].state(data);

      this._sequences[productID] = data.sequence;
      this._queues[productID].forEach(this.processMessage);
      this._queues[productID] = [];
    }
  }

  processMessage(data) {
    const product_id = data.product_id;

    if (this._sequences[product_id] == -1) {
      // Resync is in process
      return;
    }
    if (data.sequence <= this._sequences[product_id]) {
      // Skip this one, since it was already processed
      return;
    }

    if (data.sequence != this._sequences[product_id] + 1) {
      // Dropped a message, start a resync process
      this._queues[product_id] = [];
      this._sequences[product_id] = -1;

      this.loadOrderbook(product_id);
      return;
    }

    this._sequences[product_id] = data.sequence;
    const book = this.books[product_id];

    switch (data.type) {
      case 'open':
        book.add(data);
        break;

      case 'done':
        book.remove(data.order_id);
        break;

      case 'match':
        book.match(data);
        break;

      case 'change':
        book.change(data);
        break;
    }
  }
}

module.exports = exports = OrderbookSync;

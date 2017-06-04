const assert = require('assert');
const nock = require('nock');

const Gdax = require('../index.js');
const publicClient = new Gdax.PublicClient();

const EXCHANGE_API_URL = 'https://api.gdax.com';

suite('PublicClient');

test('get product trades', function(done) {
  const expectedResponse = [
    {
      time: '2014-11-07T22:19:28.578544Z',
      trade_id: 74,
      price: '10.00000000',
      size: '0.01000000',
      side: 'buy'
    },
    {
      time: '2014-11-07T01:08:43.642366Z',
      trade_id: 73,
      price: '100.00000000',
      size: '0.01000000',
      side: 'sell'
    }
  ];

  nock(EXCHANGE_API_URL)
    .get('/products/BTC-USD/trades')
    .reply(200, expectedResponse);

  publicClient.getProductTrades(function(err, resp, data) {
    assert.ifError(err);
    assert.deepEqual(data, expectedResponse);

    nock.cleanAll();
    done();
  });
});

test('public client should return values', function(done) {
  nock(EXCHANGE_API_URL).get('/products/BTC-USD/ticker').reply(200, {
    trade_id: 'test-id',
    price: '9.00',
    size: '5'
  });

  publicClient.getProductTicker(function(err, resp, data) {
    assert.ifError(err);

    assert.equal(data.trade_id, 'test-id');
    assert(data.price, '9.00');
    assert(data.size, '5');

    nock.cleanAll();
    done();
  });
});

test('public client should stream trades', function(done) {
  this.timeout(6000);

  let last = 8408014;

  publicClient
    .getProductTradeStream(last, 8409426)
    .on('data', data => {
      const current = data.trade_id;
      assert.equal(typeof current, 'number');
      assert.equal(
        current,
        last + 1,
        current + ' is next in series, last: ' + last
      );
      last = current;
    })
    .on('end', () => {
      assert.equal(last, 8409425, 'ended on ' + last);
      done();
    });
});

test('public client should stream trades with function', function(done) {
  this.timeout(6000);

  let last = 8408014;

  publicClient
    .getProductTradeStream(
      last,
      trade => Date.parse(trade.time) >= 1463068800000
    )
    .on('data', data => {
      const current = data.trade_id;
      assert.equal(typeof current, 'number');
      assert.equal(
        current,
        last + 1,
        current + ' is next in series, last: ' + last
      );
      last = current;
    })
    .on('end', () => {
      assert.equal(last, 8409426, last);
      done();
    });
});

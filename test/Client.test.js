const Assert = require('assert');
const { Client } = require('../src');
const Context = require('./context');

describe('Client', function() {
    describe('constructor()', function() {
        it('should expect deploymentUrl parameter', function() {
            new Client('https://www.google.com');
        });
        it('should validate deploymentUrl parameter', function() {
            let message;
            try {
                new Client({});
            } catch (error) {
                message = error.message;
            }
            Assert.strictEqual(message, 'deploymentUrl(string) required');
        });
    });
    describe('request()', function() {
        it('should limit concurrent requests', async function() {
            this.timeout(50000);
            const client = new Client(Context.deploymentUrl, {
                maxConcurrent: 2,
            });
            const times = [];

            const doRequest = async function(index) {
                const start = Date.now();
                await client.request('GET', '/health');
                times[index] = Date.now() - start;
            };

            await Promise.all([
                doRequest(0),
                doRequest(1),
                doRequest(2),
                doRequest(3),
                doRequest(4),
                doRequest(5),
            ]);

            Assert.ok(
                times[0] < times[2],
                'first request must finish before third request'
            );
            Assert.ok(
                times[1] < times[2],
                'second request must finish before third request'
            );
            Assert.ok(
                times[2] < times[4],
                'third request must finish before fifth request'
            );
            Assert.ok(
                times[3] < times[4],
                'fourth request must finish before fifth request'
            );
        });
        it('should throw an error if not authorized', async function() {
            const client = new Client(Context.deploymentUrl);

            let message;
            try {
                const result = await client.request('GET', '/api/webtask');
            } catch (error) {
                message = error.message;
            }

            Assert.equal(
                message,
                "Request failed with status '403' and message 'rejecting request without Authorization header or key URL query parameter'."
            );
        });
    });
});

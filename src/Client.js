const Assert = require('assert');
const Request = require('request');
const _ = require('lodash');

const defaultMaxRetry = 10;
const defaultMaxConcurrent = 10;

async function backoffDelay(attempt, factor = 2, min = 50, max = 5000) {
    const random = Math.random() + 1;
    const delay = Math.min(
        Math.round(random * min * Math.pow(factor, attempt)),
        max
    );
    return new Promise(resolve => setTimeout(() => resolve(), delay));
}

async function requestQueued(client, options) {
    const promise = new Promise(function(resolve, reject) {
        client._queue.push({ resolve, reject, options });
    });

    const drainQueue = () => {
        if (client._queue.length && client._inflight < client._maxConcurrent) {
            const next = client._queue.shift();
            client._inflight++;
            Request(next.options, (error, response, webtasks) => {
                client._inflight--;
                process.nextTick(drainQueue);
                if (error) {
                    return next.reject(error);
                }
                next.resolve(webtasks);
            });
        }
    };

    process.nextTick(drainQueue);
    return promise;
}

async function requestWithRetry(client, options, attempt, maxRetry) {
    let result
    try {
        result = await requestQueued(client, options);
    } catch (error) {
        if (error.statusCode == 404) {
            return null;
        }
        if (attempt < maxRetry) {
            await backoffDelay(++attempt);
            return await requestWithRetry(client, options, attempt, maxRetry);
        }
        throw error;
    }

    if (result && result.code && result.message) {
        const message = [
            `Request failed with status '${result.code}'`,
            `and message '${result.message}'.`
        ].join(' ');
        throw new Error(message);
    }
    return result;
}

class Client {
    constructor(deploymentUrl, options) {
        Assert.ok(_.isString(deploymentUrl), 'deploymentUrl(string) required');
        options = options || {};
        Assert.ok(_.isObject(options), 'options(object) invalid type');

        this._deploymentUrl = _.trimEnd(deploymentUrl, '/');

        this._maxRetry = options.maxRetry || defaultMaxRetry;
        this._maxConcurrent = options.maxConcurrent || defaultMaxConcurrent;
        this._inflight = 0;
        this._queue = [];
    }

    getDeploymentUrl() {
        return this._deploymentUrl
    }

    getMaxRetry() {
        return this._maxRetry;
    }

    getMaxConcurrent() {
        return this._maxConcurrent;
    }

    async request(method, path, token, body) {
        const options = {
            method,
            url: `${this._deploymentUrl}/${_.trimStart(path, '/')}`,
            json: true,
        };
        if (token) {
            options.auth = { bearer: token.getEncodedString() };
        }
        if (body) {
            options.body = body;
        }

        return await requestWithRetry(this, options, 0, this._maxRetry);
    }
}

module.exports = Client;

'use strict';

const Assert = require('assert');
const Request = require('request');
const _ = require('lodash');

const defaultMaxRetry = 10;
const defaultMaxConcurrent = 10;

function getOptions(client, method, path, token, body) {
    const url = path
        ? `${client._deploymentUrl}/${_.trimStart(path, '/')}`
        : client._deploymentUrl;
    const json = !body || !_.isString(body);

    const options = { method, url, json };
    if (token) {
        options.auth = { bearer: token.getEncodedString() };
    }
    if (body) {
        options.body = body;
    }

    return options;
}

function drainQueue(client) {
    const queue = client._queue;
    if (queue.length && client._inflight < client._maxConcurrent) {
        const next = client._queue.shift();
        client._inflight++;

        Request(next.options, (error, response, body) => {
            client._inflight--;

            const status = (response && response.statusCode) || 0;
            if (status >= 300) {
                if (status === 404) {
                    return next.resolve(null);
                }

                let message;
                if (status === 409) {
                    message = 'Conditional PUT failed with etag mismatch';
                } else {
                    const innerMessage =
                        body && body.message
                            ? ` and message '${body.message}'.`
                            : '';
                    message = [
                        `Request failed with status '${status}'`,
                        innerMessage,
                    ].join('');
                }

                error = new Error(message);
            }

            if (error) {
                error.canRetry = response.statusCode >= 500;
                return next.reject(error);
            }

            next.resolve(body);
            drainQueue(client);
        });
    }
}

async function backoffDelay(attempt, factor = 2, min = 50, max = 5000) {
    const random = Math.random() + 1;
    const delay = Math.min(
        Math.round(random * min * Math.pow(factor, attempt)),
        max
    );
    return new Promise(resolve => setTimeout(() => resolve(), delay));
}

async function request(client, options) {
    return new Promise(function(resolve, reject) {
        const next = { options, resolve, reject };
        client._queue.push(next);
        drainQueue(client);
    });
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
        return this._deploymentUrl;
    }

    getMaxRetry() {
        return this._maxRetry;
    }

    getMaxConcurrent() {
        return this._maxConcurrent;
    }

    clone() {
        const options = {
            maxConcurrent: this._maxConcurrent,
            maxRetry: this._maxRetry,
        };
        return new Client(this._deploymentUrl, options);
    }

    async request(method, path, token, body) {
        const options = getOptions(this, method, path, token, body);

        for (let attempt = 0; attempt <= this._maxRetry; attempt++) {
            try {
                return await request(this, options);
            } catch (error) {
                if (!error.canRetry || attempt == this._maxRetry) {
                    throw error;
                }
            }
            await backoffDelay(attempt);
        }
    }
}

module.exports = Client;

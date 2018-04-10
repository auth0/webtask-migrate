const Assert = require('assert');
const EventEmitter = require('events');
const _ = require('lodash');

const Deployment = require('./Deployment');
const WebtaskAnalyzer = require('./WebtaskAnalyzer');

const listLimit = 100;

const DownloaderState = {
    initialized: 'initialized',
    downloading: 'downloading',
    paused: 'paused',
    done: 'done',
};

async function downloadWebtask(downloader, webtaskInfo) {
    if (downloader._namesOnly) {
        downloader._webtasks.push(webtaskInfo);
        process.nextTick(() => downloader.emit('webtask', webtaskInfo));
        return;
    }

    const deployment = downloader._deployment;
    const queue = downloader._queue;

    try {
        const { tenantName, webtaskName } = webtaskInfo;
        const options = {
            includeCron: downloader._includeCron,
            includeStorage: downloader._includeStorage,
            includeSecrets: downloader._includeSecrets,
        };
        const webtask = await deployment.downloadWebtask(
            tenantName,
            webtaskName,
            options
        );
        webtaskInfo.webtask = webtask;
    } catch (error) {
        queue.push(async () => emitError(downloader, error));
        return;
    }

    if (downloader._runAnalysis) {
        try {
            const webtask = webtaskInfo.webtask;
            const analysis = await downloader._analyzer.analyze(webtask);
            webtaskInfo.analysis = analysis;
        } catch (error) {
            queue.push(async () => emitError(downloader, error));
            return;
        }
    }

    downloader._webtasks.push(webtaskInfo);
    process.nextTick(() => downloader.emit('webtask', webtaskInfo));
}

function emitError(downloader, error) {
    downloader._errors.push(error);
    process.nextTick(() => downloader.emit('error', error.message));
}

function listWebtasks(downloader) {
    const deployment = downloader._deployment;
    const tenantName = downloader._tenantName;
    const queue = downloader._queue;
    let index = 0;
    let isListingDone = false;

    const doListWebtasks = async () => {
        if (isListingDone) {
            return;
        }

        const options = {
            offset: index++ * listLimit,
            limit: listLimit,
        };

        let webtaskInfos;

        try {
            webtaskInfos = await deployment.listWebtasks(tenantName, options);
        } catch (error) {
            queue.push(async () => emitError(downloader, error));
        }

        if (webtaskInfos) {
            for (const webtaskInfo of webtaskInfos) {
                let include = true;
                if (downloader._filter) {
                    try {
                        include = downloader._filter(webtaskInfo);
                    } catch (error) {
                        queue.push(async () => emitError(downloader, error));
                    }
                }
                if (include) {
                    queue.push(
                        async () =>
                            await downloadWebtask(downloader, webtaskInfo)
                    );
                }
            }

            if (!webtaskInfos.length) {
                isListingDone = true;
                return;
            }
        }

        queue.push(doListWebtasks);
    };

    _.times(deployment.getClient().getMaxConcurrent(), () =>
        queue.push(doListWebtasks)
    );
}

function nextAction(downloader) {
    process.nextTick(() => {
        if (downloader._state === DownloaderState.downloading) {
            const action = downloader._queue.shift();
            if (!action) {
                if (!downloader._inflight) {
                    downloader._state = DownloaderState.done;
                    downloader.emit('done');
                }
                return;
            }

            downloader._inflight++;
            process.nextTick(async () => {
                await action();
                downloader._inflight--;
                nextAction(downloader);
            });
            nextAction(downloader);
        }
    });
}

class WebtaskDownloader extends EventEmitter {
    constructor(deployment, tenantName, options) {
        super();
        Assert.ok(
            deployment instanceof Deployment,
            'deployment(Deployment) required'
        );

        if (_.isObject(tenantName)) {
            options = tenantName;
            tenantName = null;
        }
        options = options || {};
        Assert.ok(_.isObject(options), 'options(object) invalid type');

        this._deployment = deployment;
        this._tenantName = tenantName;
        this._namesOnly = !!(options.namesOnly || false);
        this._runAnalysis = !!(options.runAnalysis || false);
        this._includeSecrets = !!(options.includeSecrets || false);
        this._includeStorage = !!(options.includeStorage || false);
        this._includeCron = !!(options.includeCron || false);
        this._filter = options.filter || null;
        this._state = DownloaderState.initialized;
        this._queue = [];
        this._webtasks = [];
        this._errors = [];
        this._inflight = 0;
        this._analyzer = this._runAnalysis
            ? new WebtaskAnalyzer(deployment, tenantName)
            : null;
    }

    getDownloadedWebtasks() {
        return _.clone(this._webtasks);
    }
    getErrors() {
        return _.clone(this._errors);
    }

    download() {
        if (this._state === DownloaderState.initialized) {
            this._state = DownloaderState.downloading;
            listWebtasks(this);
            nextAction(this);
        }

        if (this._state === DownloaderState.paused) {
            this._state = DownloaderState.downloading;
            nextAction(this);
        }
    }

    pause() {
        if (this._state === DownloaderState.downloading) {
            this._state = DownloaderState.paused;
        }
    }
}

module.exports = WebtaskDownloader;

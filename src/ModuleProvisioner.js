'use strict';

const Assert = require('assert');
const EventEmitter = require('events');
const _ = require('lodash');

const Deployment = require('./Deployment');

const cachedAvailableModules = {};

const delayPerModule = 100;
const moduleLimit = 25;

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function onAvailableModule(provisioner, aModule) {
    provisioner._availableModules.push(aModule);
    cachedAvailableModules[aModule.name] =
        cachedAvailableModules[aModule.name] || {};
    cachedAvailableModules[aModule.name][aModule.version] = 1;
    try {
        provisioner.emit('module', aModule);
    } catch (error) {
        // do nothing
    }
}

function onFailedModule(provisioner, aModule) {
    provisioner._failedModules.push(aModule);
    try {
        provisioner.emit('failed', aModule);
    } catch (error) {
        // do nothing
    }
}

function onDone(provisioner) {
    if (!provisioner._done) {
        provisioner._done = true;
        try {
            provisioner.emit('done', provisioner);
        } catch (error) {
            // do nothing
        }
    }
}

function onError(provisioner, error) {
    provisioner._errors.push(error);
    try {
        provisioner.emit('error', error.message);
    } catch (error) {
        // do nothing
    }
}

async function provision(provisioner) {
    const queuedModules = provisioner._queuedModules;
    const deployment = provisioner._deployment;
    const tenantName = provisioner._tenantName;

    if (!queuedModules.length || provisioner._done) {
        if (!provisioner._inflight) {
            onDone(provisioner);
        }
        return;
    }

    const toProvision = queuedModules.splice(0, moduleLimit);

    let results;
    provisioner._inflight++;
    try {
        results = await deployment.provisionModules(toProvision, tenantName);
    } catch (error) {
        onError(provisioner, error);
        onDone(provisioner);
        return;
    }
    provisioner._inflight--;

    if (results) {
        let stillQueued = 0;
        for (const result of results) {
            const { name, version, state } = result;
            const aModule = { name, version };
            if (state === 'available') {
                onAvailableModule(provisioner, aModule);
            } else if (state === 'failed') {
                onFailedModule(provisioner, aModule);
            } else {
                stillQueued++;
                queuedModules.push(aModule);
            }
        }

        if (stillQueued) {
            await delay(stillQueued * delayPerModule);
        }

        await provision(provisioner);
    }
}

class ModuleProvisioner extends EventEmitter {
    constructor(deployment, modules, tenantName) {
        super();
        Assert.ok(
            deployment instanceof Deployment,
            'deployment(Deployment) required'
        );
        Assert.ok(_.isArray(modules), 'modules(array) required');
        for (const aModule of modules) {
            Assert.ok(_.isString(aModule.name), 'module.name(string) required');
            Assert.ok(
                _.isString(aModule.version),
                'module.version(string) required'
            );
        }

        if (tenantName) {
            Assert.ok(
                _.isString(tenantName),
                'tenantName(string) invalid type'
            );
        }

        this._deployment = deployment;
        this._modules = modules;
        this._tenantName = tenantName || null;
        this._queuedModules = [];
        this._availableModules = [];
        this._failedModules = [];
        this._errors = [];
        this._started = false;
        this._done = false;
        this._inflight = 0;
    }

    getAvailableModules() {
        return _.clone(this._availableModules);
    }

    getQueuedModules() {
        return _.clone(this._queuedModules);
    }

    getFailedModules() {
        return _.clone(this._failedModules);
    }

    provision() {
        if (!this._started) {
            this._started = true;
            for (const aModule of this._modules) {
                const cachedName = cachedAvailableModules[aModule.name];
                if (cachedName && cachedName[aModule.version]) {
                    onAvailableModule(this, aModule);
                } else {
                    this._queuedModules.push(aModule);
                }
            }
            _.times(10, () => provision(this));
        }
    }
}

module.exports = ModuleProvisioner;

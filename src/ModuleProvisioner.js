const Assert = require('assert');
const EventEmitter = require('events');
const _ = require('lodash');

const Deployment = require('./Deployment');

const cachedAvailableModules = {};

const delayPerModule = 100;
const moduleLimit = 25;

const ProvisionerState = {
    initialized: 'initialized',
    provisioning: 'provisioning',
    paused: 'paused',
    done: 'done',
};

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function onAvailableModule(provisioner, aModule) {
    provisioner._availableModules.push(aModule);
    process.nextTick(() => provisioner.emit('module', aModule));
}

async function onFailedModule(provisioner, aModule) {
    provisioner._failedModules.push(aModule);
    process.nextTick(() => provisioner.emit('failed', aModule));
}

function emitError(provisioner, error) {
    provisioner._errors.push(error);
    process.nextTick(() => provisioner.emit('error', error.message));
}

function queueModules(provisioner) {
    for (const aModule of provisioner._modules) {
        Assert.ok(_.isString(aModule.name), 'module.name(string) required');
        Assert.ok(
            _.isString(aModule.version),
            'module.version(string) required'
        );

        const queue = provisioner._queue;
        const availableModules = provisioner._availableModules;
        const queuedModules = provisioner._queuedModules;
        const deployment = provisioner._deployment;
        const tenantName = provisioner._tenantName;

        const cachedName = cachedAvailableModules[aModule.name];
        if (cachedName && cachedName[aModule.version]) {
            queue.push(async () => onAvailableModule(provisioner, aModule));
        } else {
            queuedModules.push(aModule);
        }

        const doProvisioning = async () => {
            if (!queuedModules.length) {
                return;
            }

            const toProvision = queuedModules.splice(0, moduleLimit);

            let results;
            try {
                results = await deployment.provisionModules(
                    toProvision,
                    tenantName
                );
            } catch (error) {
                queue.push(async () => emitError(provisioner, error));
            }

            if (results) {
                let stillQueued = 0;
                for (const result of results) {
                    const { name, version, state } = result;
                    const aModule = { name, version };
                    if (state === 'available') {
                        queue.push(async () =>
                            onAvailableModule(provisioner, aModule)
                        );
                    } else if (state === 'failed') {
                        queue.push(async () =>
                            onFailedModule(provisioner, aModule)
                        );
                    } else {
                        stillQueued++;
                        queuedModules.push(aModule);
                    }
                }

                if (stillQueued) {
                    await delay(stillQueued * delayPerModule);
                }

                queue.push(doProvisioning);
            }
        };

        _.times(deployment.getClient().getMaxConcurrent(), () =>
            queue.push(doProvisioning)
        );
    }
}

function nextAction(provisioner) {
    process.nextTick(() => {
        if (provisioner._state === ProvisionerState.provisioning) {
            const action = provisioner._queue.shift();
            if (!action) {
                if (!provisioner._inflight) {
                    provisioner._state = ProvisionerState.done;
                    provisioner.emit('done');
                }
                return;
            }

            provisioner._inflight++;
            process.nextTick(async () => {
                await action();
                provisioner._inflight--;
                nextAction(provisioner);
            });
            nextAction(provisioner);
        }
    });
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
        this._queue = [];
        this._state = ProvisionerState.initialized;
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
        if (this._state === ProvisionerState.initialized) {
            this._state = ProvisionerState.provisioning;
            queueModules(this);
            nextAction(this);
        }

        if (this._state === ProvisionerState.paused) {
            this._state = ProvisionerState.provisioning;
            nextAction(this);
        }
    }

    pause() {
        if (this._state === ProvisionerState.provisioning) {
            this._state = ProvisionerState.paused;
        }
    }
}

module.exports = ModuleProvisioner;

const Assert = require('assert');
const fs = require('fs');
const { ModuleProvisioner, Deployment, TokenStore, Token } = require('../src');
const Context = require('./context');

describe('ModuleProvisioner', function() {
    describe('constructor()', function() {
        it('should expect deployment, modules parameters', function() {
            const tokenStore = new TokenStore();
            const deployment = new Deployment(tokenStore, Context.deploymentUrl);
            const modules = [ { name: 'lodash', version: '4.17.5' }];
            new ModuleProvisioner(deployment, modules);
        });
        it('should validate deployment parameter', function() {
            const modules = [ { name: 'lodash', version: '4.17.5' }];
            let message;
            try {
                new ModuleProvisioner({}, modules);
            } catch (error) {
                message = error.message;
            }
            Assert.strictEqual(message, 'deployment(Deployment) required');
        });
        it('should validate modules parameter', function() {
            const tokenStore = new TokenStore();
            const deployment = new Deployment(tokenStore, Context.deploymentUrl);
            try {
                new ModuleProvisioner(deployment, {});
            } catch (error) {
                message = error.message;
            }
            Assert.strictEqual(message, 'modules(array) required');
        });
        it('should validate module objects in modules parameter', function() {
            const tokenStore = new TokenStore();
            const deployment = new Deployment(tokenStore, Context.deploymentUrl);
            const modules = [ { name: 'lodash' }];
            try {
                new ModuleProvisioner(deployment, modules);
            } catch (error) {
                message = error.message;
            }
            Assert.strictEqual(message, 'module.version(string) required');
        });
    });
    describe('provision()', function() {
        it('should provision a module', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(tokenStore, Context.deploymentUrl);
            const modules = [ { name: 'lodash', version: '4.17.5' }];
            const provisioner = new ModuleProvisioner(deployment, modules);
            return new Promise( (resolve, reject) => {
                provisioner.on('done', () => {
                    const availableModules = provisioner.getAvailableModules();
                    try {
                        Assert.equal(availableModules.length, 1, 'module not available');
                        Assert.equal(availableModules[0].name, 'lodash');
                        Assert.equal(availableModules[0].version, '4.17.5');
                    } catch (error){
                        reject(error);
                    }
                    resolve();
                })
                provisioner.on('error', reject);
                provisioner.provision();
            });
        });
        it('should provision thousands of modules', async function() {
            this.timeout(20000);
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(tokenStore, Context.deploymentUrl);

            const modules = require('./data/modules.json');
            const provisioner = new ModuleProvisioner(deployment, modules);

            let moduleEvent = 0;
            let failedEvent = 0;
            return new Promise( (resolve, reject) => {
                provisioner.on('done', () => {
                    const available = provisioner.getAvailableModules();
                    const failed = provisioner.getFailedModules();
                    try {
                        Assert.equal(available.length , moduleEvent, 'module events count is off');
                        Assert.equal(failed.length , failedEvent, 'failed events count is off');
                        Assert.equal(available.length + failed.length, modules.length, 'missing some modules');
                    } catch (error){
                        reject(error);
                    }
                    resolve();
                })
                provisioner.on('module', aModule => moduleEvent++);
                provisioner.on('failed', aModule => failedEvent++);
                provisioner.on('error', reject);
                provisioner.provision();
            });
        });
    });
});

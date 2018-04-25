const Assert = require('assert');
const _ = require('lodash');
const { Webtask, TokenStore, Token, Deployment, Client } = require('../src');
const Context = require('./context');

describe('Deployment', function() {
    this.timeout(10000);
    describe('constructor()', function() {
        it('should accept tokenStore and deploymentUrl parameters', function() {
            const tokenStore = new TokenStore();
            new Deployment(tokenStore, Context.deploymentUrl);
        });
        it('should accept tokenStore, deploymentUrl and options parameters', function() {
            const tokenStore = new TokenStore();
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl,
                { maxConcurrent: 2 }
            );
            const client = deployment.getClient();
            Assert.ok(client.getMaxConcurrent(), 2);
        });
        it('should accept tokenStore and client parameters', function() {
            const tokenStore = new TokenStore();
            const client = new Client(Context.deploymentUrl, {
                maxConcurrent: 2,
            });
            new Deployment(tokenStore, client);
        });
        it('should validate deploymentUrl parameter', function() {
            const tokenStore = new TokenStore();
            let message;
            try {
                new Deployment(tokenStore, {});
            } catch (error) {
                message = error.message;
            }
            Assert.strictEqual(message, 'deploymentUrl(string) required');
        });
        it('should validate {tokenStore} parameter', function() {
            let message;
            try {
                new Deployment({}, Context.deploymentUrl);
            } catch (error) {
                message = error.message;
            }
            Assert.strictEqual(message, 'tokenStore(TokenStore) required');
        });
    });
    describe('createTenant()', function() {
        it('should return a tenant token', async function() {
            const tokenStore = new TokenStore();
            const masterToken = new Token(Context.masterTokenString);
            await tokenStore.addToken(masterToken);

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);

            const token = await deployment.createTenant('auth0-test-tenant2');
            Assert.ok(
                token instanceof Token,
                'should have returned a token instance'
            );
            Assert.ok(
                token.isTenantToken(),
                'should have returned a tenant token'
            );
        });
        it('should store the tenant token', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);

            await deployment.createTenant('tenantA');

            const token = await tokenStore.getTenantToken('tenantA');
            Assert.ok(
                token instanceof Token,
                'should have returned a token instance'
            );
            Assert.ok(
                token.isTenantToken(),
                'should have returned a tenant token'
            );
        });
    });
    describe('downloadWebtask()', function() {
        it('should download a webtask', async function() {
            const tenantName = Context.tenant1.name;
            const webtaskName = 'webtaskA';
            const code = 'module.exports = (cb) => cb(null, "Hello World")';
            const webtask = new Webtask(code);

            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.tenant1.tokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);

            await deployment.uploadWebtask(tenantName, webtaskName, webtask);

            const actual = await deployment.downloadWebtask(
                tenantName,
                webtaskName
            );
            Assert.strictEqual(actual.getCode(), code);

            await deployment.deleteWebtask(tenantName, webtaskName);
        });
        it('should return null for non-existing webtask', async function() {
            const tenantName = Context.tenant1.name;
            const webtaskName = 'webtaskA';
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.tenant1.tokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);

            const webtask = await deployment.downloadWebtask(
                tenantName,
                webtaskName
            );

            Assert.strictEqual(webtask, null);
        });
        it('should download a webtask with storage', async function() {
            const tenantName = Context.tenant1.name;
            const webtaskName = 'webtaskA';
            const code = 'module.exports = (cb) => cb(null, "Hello World")';
            const storage = { data: { a: 1, b: 2 } };
            const webtask = new Webtask(code, { storage });

            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.tenant1.tokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);

            await deployment.deleteWebtask(tenantName, webtaskName);

            await deployment.uploadWebtask(tenantName, webtaskName, webtask, {
                overwriteStorage: true,
            });

            const actual = await deployment.downloadWebtask(
                tenantName,
                webtaskName,
                { includeStorage: true }
            );
            Assert.strictEqual(actual.getCode(), code);
            Assert.strictEqual(actual.getStorageData(), '{"a":1,"b":2}');
            Assert.strictEqual(actual.getStorageEtag(), 1);

            await deployment.deleteWebtask(tenantName, webtaskName);
        });
        it('should download a webtask with cron', async function() {
            const tenantName = Context.tenant1.name;
            const webtaskName = 'webtaskA';
            const code = 'module.exports = (cb) => cb(null, "Hello World")';
            const cron = {
                schedule: '40 3 * * *',
                tz: 'US/Pacific',
                state: 'inactive',
            };
            const webtask = new Webtask(code, { cron });

            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.tenant1.tokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);

            await deployment.uploadWebtask(tenantName, webtaskName, webtask);

            const actual = await deployment.downloadWebtask(
                tenantName,
                webtaskName,
                { includeCron: true }
            );
            Assert.strictEqual(actual.getCode(), code);
            Assert.strictEqual(actual.getCron().schedule, '40 3 * * *');
            Assert.strictEqual(actual.getCron().tz, 'US/Pacific');
            Assert.strictEqual(actual.getCron().state, 'inactive');

            await deployment.deleteWebtask(tenantName, webtaskName);
        });
    });
    describe('uploadWebtask()', function() {
        it('should update a webtask with storage', async function() {
            const tenantName = Context.tenant1.name;
            const webtaskName = 'webtaskA';
            const code = 'module.exports = (cb) => cb(null, "Hello World")';
            const storage = { data: { a: 1, b: 2 } };
            const webtask = new Webtask(code, { storage });

            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.tenant1.tokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);

            await deployment.deleteWebtask(tenantName, webtaskName);

            await deployment.uploadWebtask(tenantName, webtaskName, webtask, {
                overwriteStorage: true,
            });

            const downloaded = await deployment.downloadWebtask(
                tenantName,
                webtaskName,
                { includeStorage: true }
            );
            downloaded.setStorageData({ a: 1, b: 1, c: 3 });
            await deployment.uploadWebtask(tenantName, webtaskName, downloaded);

            const actual = await deployment.downloadWebtask(
                tenantName,
                webtaskName,
                { includeStorage: true }
            );
            Assert.strictEqual(actual.getCode(), code);
            Assert.strictEqual(actual.getStorageData(), '{"a":1,"b":1,"c":3}');
            Assert.strictEqual(actual.getStorageEtag(), 2);
            await deployment.deleteWebtask(tenantName, webtaskName);
        });
        it('should ignore storage etag with overwrite option', async function() {
            const tenantName = Context.tenant1.name;
            const webtaskName = 'webtaskD';
            const code = 'module.exports = (cb) => cb(null, "Hello World")';
            const storage = { etag: 4, data: { a: 1, b: 2 } };
            const webtask = new Webtask(code, { storage });

            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.tenant1.tokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);

            await deployment.deleteWebtask(tenantName, webtaskName);

            await deployment.uploadWebtask(tenantName, webtaskName, webtask, {
                overwriteStorage: true,
            });

            const actual = await deployment.downloadWebtask(
                tenantName,
                webtaskName,
                { includeStorage: true }
            );
            Assert.strictEqual(actual.getStorageData(), '{"a":1,"b":2}');
            Assert.strictEqual(actual.getStorageEtag(), 1);

            await deployment.deleteWebtask(tenantName, webtaskName);
        });
        it('should error with storage conflicts', async function() {
            const tenantName = Context.tenant1.name;
            const webtaskName = 'webtaskA';
            const code = 'module.exports = (cb) => cb(null, "Hello World")';
            const storage = { data: { a: 1, b: 2 } };
            const webtask = new Webtask(code, { storage });

            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.tenant1.tokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);

            await deployment.deleteWebtask(tenantName, webtaskName);

            await deployment.uploadWebtask(tenantName, webtaskName, webtask, { overwriteStorage: true });

            const downloaded1 = await deployment.downloadWebtask(
                tenantName,
                webtaskName,
                { includeStorage: true }
            );
            const downloaded2 = await deployment.downloadWebtask(
                tenantName,
                webtaskName,
                { includeStorage: true }
            );

            downloaded1.setStorageData({ a: 1, b: 1, c: 3 });
            await deployment.uploadWebtask(
                tenantName,
                webtaskName,
                downloaded1
            );

            downloaded2.setStorageData({ a: 1, b: 0, c: 4 });
            let message;
            try {
                const result = await deployment.uploadWebtask(
                    tenantName,
                    webtaskName,
                    downloaded2
                );
            } catch (error) {
                message = error.message;
            }

            Assert.strictEqual(
                message,
                'Failed to upload the storage data to the webtask due to the following error: Conditional PUT failed with etag mismatch'
            );

            await deployment.deleteWebtask(tenantName, webtaskName);
        });
        it('should ensure storage conflicts with new storage', async function() {
            const tenantName = Context.tenant1.name;
            const webtaskName = 'webtaskA';
            const code = 'module.exports = (cb) => cb(null, "Hello World")';

            const storage1 = { data: { a: 1, b: 2 } };
            const webtask1 = new Webtask(code, { storage: storage1 });

            const storage2 = { data: { c: 3, b: 1 } };
            const webtask2 = new Webtask(code, { storage: storage2 });

            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.tenant1.tokenString));

            const deploymentUrl = Context.toDeploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);

            await deployment.deleteWebtask(tenantName, webtaskName);

            await deployment.uploadWebtask(tenantName, webtaskName, webtask1);

            let message;
            try {
                const result = await deployment.uploadWebtask(
                    tenantName,
                    webtaskName,
                    webtask2
                );
            } catch (error) {
                message = error.message;
            }

            Assert.strictEqual(
                message,
                'Failed to upload the storage data to the webtask due to the following error: Conditional PUT failed with etag mismatch'
            );

            await deployment.deleteWebtask(tenantName, webtaskName);
        });
    });
    describe('listWebtask()', function() {
        it('should return all webtasks if no tenant is given', async function() {
            const tenant1 = Context.tenant1.name;
            const webtask1 = 'webtaskA';
            const tenant2 = Context.tenant2.name;
            const webtask2 = 'webtaskB';
            const code = 'module.exports = (cb) => cb(null, "Hello World")';
            const webtask = new Webtask(code);

            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            await tokenStore.addToken(new Token(Context.tenant1.tokenString));
            await tokenStore.addToken(new Token(Context.tenant2.tokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);

            await deployment.uploadWebtask(tenant1, webtask1, webtask);
            await deployment.uploadWebtask(tenant2, webtask2, webtask);

            const webtaskListing = await deployment.listWebtasks();
            Assert.ok(webtaskListing.length, 2);

            await deployment.deleteWebtask(tenant1, webtask1);
            await deployment.deleteWebtask(tenant2, webtask2);
        });
    });
    describe('provisionModules()', function() {
        it('should validate modules parameter', async function() {
            const tenantName = Context.tenant1.name;
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.tenant1.tokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);
            let message;
            try {
                await deployment.provisionModules({});
            } catch (error) {
                message = error.message;
            }
            Assert.strictEqual(message, 'modules(array) required');
        });
        it('should validate module object of modules parameter', async function() {
            const tenantName = Context.tenant1.name;
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.tenant1.tokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);
            let message;
            try {
                await deployment.provisionModules([{ version: '4.17.5' }]);
            } catch (error) {
                message = error.message;
            }
            Assert.strictEqual(message, 'module.name(string) required');
        });
        it('should provision a module with a tenant token', async function() {
            const tenantName = Context.tenant1.name;
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.tenant1.tokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);
            const modules = [{ name: 'lodash', version: '4.17.5' }];

            const result = await deployment.provisionModules(
                modules,
                tenantName
            );
            Assert.ok(result.length, 1);
            Assert.ok(result[0].name, 'lodash');
            Assert.ok(result[0].version, '4.17.5');
        });
        it('should provision a module with a master token', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);
            const modules = [{ name: 'lodash', version: '4.17.5' }];

            const result = await deployment.provisionModules(modules);
            Assert.ok(result.length, 1);
            Assert.ok(result[0].name, 'lodash');
            Assert.ok(result[0].version, '4.17.5');
        });
        it('should provision up to 50 modules', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));

            const deploymentUrl = Context.deploymentUrl;
            const deployment = new Deployment(tokenStore, deploymentUrl);

            const modules = require('./data/modules.json');
            const result = await deployment.provisionModules(
                _.take(modules, 50)
            );
            Assert.ok(result.length, 50);
        });
    });
});

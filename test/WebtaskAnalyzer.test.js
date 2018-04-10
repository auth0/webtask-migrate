const Assert = require('assert');
const fs = require('fs');
const { WebtaskAnalyzer, Deployment, TokenStore, Token, Webtask } = require('../src');
const Context = require('./context');

describe('WebtaskAnalyzer', function() {
    describe('constructor()', function() {
        it('should expect deployment parameter', function() {
            const tokenStore = new TokenStore();
            const deployment = new Deployment(tokenStore, Context.deploymentUrl);
            new WebtaskAnalyzer(deployment);
        });
        it('should allow tenantName parameter', function() {
            const tokenStore = new TokenStore();
            const deployment = new Deployment(tokenStore, Context.deploymentUrl);
            new WebtaskAnalyzer(deployment, 'tenantName');
        });
        it('should validate deployment parameter', function() {
            let message;
            try {
                new WebtaskAnalyzer({});
            } catch (error) {
                message = error.message;
            }
            Assert.strictEqual(message, 'deployment(Deployment) required');
        });
        it('should validate tenantName parameter', function() {
            const tokenStore = new TokenStore();
            const deployment = new Deployment(tokenStore, Context.deploymentUrl);
            let message;
            try {
                new WebtaskAnalyzer(deployment, {});
            } catch (error) {
                message = error.message;
            }
            Assert.strictEqual(message, 'tenantName(string) invalid type');
        });
    });
    describe('analyze()', function() {
        it('should analyze a webtask', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(tokenStore, Context.deploymentUrl);
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask('const _ = require("lodash");');
            const result = await analyzer.analyze(webtask);
            Assert.equal(result.warnings.length, 0);
            Assert.equal(result.dependencies.length, 1);
            Assert.equal(result.dependencies[0].name, 'lodash');
            Assert.equal(result.dependencies[0].version, '3.10.1')
        });
        it('should warn with bad code', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(tokenStore, Context.deploymentUrl);
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask('const m = "lodash";\nwhaaaa _ = require(m);');
            const result = await analyzer.analyze(webtask);
            Assert.equal(result.warnings.length, 1);
            Assert.equal(result.dependencies.length, 0);
            Assert.equal(result.warnings[0].warningType, 'analysisFailed');
            Assert.equal(result.warnings[0].codeType, 'webtask');
            Assert.equal(result.warnings[0].line, 0);
            Assert.equal(result.warnings[0].position, 0);
        });
        it('should warn with dynamic requires', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(tokenStore, Context.deploymentUrl);
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask('const m = "lodash";\nconst _ = require(m);');
            const result = await analyzer.analyze(webtask);
            Assert.equal(result.warnings.length, 1);
            Assert.equal(result.dependencies.length, 0);
            Assert.equal(result.warnings[0].warningType, 'dynamicRequire');
            Assert.equal(result.warnings[0].codeType, 'webtask');
            Assert.equal(result.warnings[0].line, 2);
            Assert.equal(result.warnings[0].position, 11);
        });
        it('should warn with unknown global', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(tokenStore, Context.deploymentUrl);
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask('let something = specialGlobal');
            const result = await analyzer.analyze(webtask);
            Assert.equal(result.warnings.length, 1);
            Assert.equal(result.dependencies.length, 0);
            Assert.equal(result.warnings[0].warningType, 'unknownGlobal');
            Assert.equal(result.warnings[0].codeType, 'webtask');
            Assert.equal(result.warnings[0].line, 1);
            Assert.equal(result.warnings[0].position, 16);
        });
    });
});

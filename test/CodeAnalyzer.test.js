const Assert = require('assert');
const CodeAnalyzer = require('../src/CodeAnalyzer');

const codeAnalyzer = new CodeAnalyzer();

describe('CodeAnalyzer', function() {
    describe('analyze()', function() {
        it('should return an entry for static requires', function() {
            const results = codeAnalyzer.analyze('require(\'lodash\')');
            Assert.equal(results.status, 'ok');
            Assert.equal(results.requires.length, 1);
            Assert.equal(results.dynamicRequires.length, 0);
            Assert.equal(results.globals.length, 0);
            Assert.equal(results.requires[0].line, 1);
            Assert.equal(results.requires[0].column, 0);
            Assert.equal(results.requires[0].value, 'lodash');
        });
        it('should return an entry for a dynamic requires', function() {
            const results = codeAnalyzer.analyze([
                'const toRequire = \'lodash\'',
                'const aModule = require(toRequire)'
            ].join('\n'));
            Assert.equal(results.status, 'ok');
            Assert.equal(results.requires.length, 0);
            Assert.equal(results.dynamicRequires.length, 1);
            Assert.equal(results.globals.length, 0);
            Assert.equal(results.dynamicRequires[0].line, 2);
            Assert.equal(results.dynamicRequires[0].column, 16);
            Assert.equal(results.dynamicRequires[0].value, '');
        });
        it('should warn with unknown global', function() {
            const results = codeAnalyzer.analyze('let something = aSpecialGlobal');
            Assert.equal(results.status, 'ok');
            Assert.equal(results.requires.length, 0);
            Assert.equal(results.dynamicRequires.length, 0);
            Assert.equal(results.globals.length, 1);
            Assert.equal(results.globals[0].line, 1);
            Assert.equal(results.globals[0].column, 16);
            Assert.equal(results.globals[0].value, 'aSpecialGlobal');
        });
        it('should fail with bad code', function() {
            const results = codeAnalyzer.analyze('const m = "lodash";\nwhaaaa _ = require(m);');
            Assert.equal(results.status, 'failed');
            Assert.equal(results.message, 'Unexpected token (2:7)');
        });
        it('should ignore require within a string', function() {
            const results = codeAnalyzer.analyze('let code = "const x = require(\'abc\')"');
            Assert.equal(results.status, 'ok');
            Assert.equal(results.requires.length, 0);
            Assert.equal(results.dynamicRequires.length, 0);
            Assert.equal(results.globals.length, 0);
        });
        it('should detect progaming model with module.exports, arrow function and cb only model', function() {
            const results = codeAnalyzer.analyze(
                'module.exports = cb => cb("hello");'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 1);
            Assert.equal(results.exportFunctionArguments[0], 'cb');
        });
        it('should detect progaming model with module.exports, arrow function and cxt model', function() {
            const results = codeAnalyzer.analyze(
                'module.exports = (cxt,cb) => cb("hello");'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 2);
            Assert.equal(results.exportFunctionArguments[0], 'cxt');
            Assert.equal(results.exportFunctionArguments[1], 'cb');
        });
        it('should detect progaming model with module.exports, arrow function and raw model', function() {
            const results = codeAnalyzer.analyze(
                'module.exports = (cxt,req,res) => cb("hello");'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 3);
            Assert.equal(results.exportFunctionArguments[0], 'cxt');
            Assert.equal(results.exportFunctionArguments[1], 'req');
            Assert.equal(results.exportFunctionArguments[2], 'res');
        });
        it('should detect progaming model with module.exports, function and cb only model', function() {
            const results = codeAnalyzer.analyze(
                'module.exports = function(cb) {cb("hello");}'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 1);
            Assert.equal(results.exportFunctionArguments[0], 'cb');
        });
        it('should detect progaming model with module.exports, function and cxt model', function() {
            const results = codeAnalyzer.analyze(
                'module.exports = function(cxt,cb) {cb("hello");}'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 2);
            Assert.equal(results.exportFunctionArguments[0], 'cxt');
            Assert.equal(results.exportFunctionArguments[1], 'cb');
        });
        it('should detect progaming model with module.exports, function and raw model', function() {
            const results = codeAnalyzer.analyze(
                'module.exports = function(cxt,req,res) {cb("hello");}'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 3);
            Assert.equal(results.exportFunctionArguments[0], 'cxt');
            Assert.equal(results.exportFunctionArguments[1], 'req');
            Assert.equal(results.exportFunctionArguments[2], 'res');
        });
        it('should detect progaming model with exports, arrow function and cb only model', function() {
            const results = codeAnalyzer.analyze(
                'exports = cb => cb("hello");'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 1);
            Assert.equal(results.exportFunctionArguments[0], 'cb');
        });
        it('should detect progaming model with exports, arrow function and cxt model', function() {
            const results = codeAnalyzer.analyze(
                'exports = (cxt,cb) => cb("hello");'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 2);
            Assert.equal(results.exportFunctionArguments[0], 'cxt');
            Assert.equal(results.exportFunctionArguments[1], 'cb');
        });
        it('should detect progaming model with exports, arrow function and raw model', function() {
            const results = codeAnalyzer.analyze(
                'exports = (cxt,req,res) => cb("hello");'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 3);
            Assert.equal(results.exportFunctionArguments[0], 'cxt');
            Assert.equal(results.exportFunctionArguments[1], 'req');
            Assert.equal(results.exportFunctionArguments[2], 'res');
        });
        it('should detect progaming model with exports, function and cb only model', function() {
            const results = codeAnalyzer.analyze(
                'exports = function(cb) { cb("hello"); }'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 1);
            Assert.equal(results.exportFunctionArguments[0], 'cb');
        });
        it('should detect progaming model with exports, function and cxt model', function() {
            const results = codeAnalyzer.analyze(
                'exports = function(cxt,cb) {cb("hello");}'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 2);
            Assert.equal(results.exportFunctionArguments[0], 'cxt');
            Assert.equal(results.exportFunctionArguments[1], 'cb');
        });
        it('should detect progaming model with exports, function and raw model', function() {
            const results = codeAnalyzer.analyze(
                'exports = function(cxt,req,res) {cb("hello");}'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 3);
            Assert.equal(results.exportFunctionArguments[0], 'cxt');
            Assert.equal(results.exportFunctionArguments[1], 'req');
            Assert.equal(results.exportFunctionArguments[2], 'res');
        });
        it('should detect no exports', function() {
            const results = codeAnalyzer.analyze(
                'const x = "hello"'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 0);
        });
        it('should detect non-function module.exports', function() {
            const results = codeAnalyzer.analyze(
                'module.exports = "hello"'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 0);
        });
        it('should detect non-function exports', function() {
            const results = codeAnalyzer.analyze(
                'exports = { message: "hello", func: (cb) => cb("hello")}'
            );
            Assert.equal(results.status, 'ok');
            Assert.equal(results.exportFunctionArguments.length, 0);
        });
    });
});

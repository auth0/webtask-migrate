'use strict';

const Assert = require('assert');
const Acorn = require('acorn');
const AcornGlobals = require('acorn-globals');
const AcornWalk = require('acorn/dist/walk');
const Astring = require('astring');
const _ = require('lodash');

const quotes = '"\'`';

// See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects
const platformGlobalNames = new Set([
    // Value properties
    'Infinity',
    'NaN',
    'undefined',
    'null',
    // Function properties
    'eval',
    'isFinite',
    'isNaN',
    'parseFloat',
    'parseInt',
    'decodeURI',
    'decodeURIComponent',
    'encodeURI',
    'encodeURIComponent',
    'escape',
    'unescape',
    // Fundamental objects
    'Object',
    'Function',
    'Boolean',
    'Symbol',
    'Error',
    'EvalError',
    'InternalError',
    'RangeError',
    'ReferenceError',
    'SyntaxError',
    'TypeError',
    'URIError',
    // Numbers and dates
    'String',
    'RegExp',
    'Number',
    'Math',
    'Date',
    // Indexed collections
    'Array',
    'Int8Array',
    'Uint8Array',
    'Uint8ClampedArray',
    'Int16Array',
    'Uint16Array',
    'Int32Array',
    'Uint32Array',
    'Float32Array',
    'Float64Array',
    // Keyed collections
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    // Structured data
    'ArrayBuffer',
    'SharedArrayBuffer ',
    'Atomics ',
    'DataView',
    'JSON',
    // Control abstraction objects
    'Promise',
    'Generator',
    'GeneratorFunction',
    'AsyncFunction',
    // Other
    'arguments',
    // Node.js globals: https://nodejs.org/api/globals.html
    'Buffer',
    '__dirname',
    '__filename',
    'clearImmediate',
    'clearInterval',
    'clearTimeout',
    'console',
    'exports',
    'global',
    'module',
    'process',
    'require',
    'setImmediate',
    'setInterval',
    'setTimeout',
    // Standard JavaScript errors: https://nodejs.org/api/errors.html#errors_errors
    'EvalError',
    'SyntaxError',
    'RangeError',
    'ReferenceError',
    'TypeError',
    'URIError',
]);

const astWalker = AcornWalk.make({
    AssignmentExpression: (node, state, recurse) => {
        AcornWalk.base[node.type](node, state, recurse);

        const { left, right } = node;
        if (
            (left.type === 'MemberExpression' &&
                left.object.name === 'module' &&
                left.property.name === 'exports') ||
            (left.type === 'Identifier' && left.name === 'exports')
        ) {
            state.exportFunctionArguments = _.map(
                node.right.params,
                node => node.name
            );
        }
    },
    CallExpression: (node, state, recurse) => {
        AcornWalk.base[node.type](node, state, recurse);

        if (
            node.callee.type === 'Identifier' &&
            node.callee.name === 'require'
        ) {
            const { line, column } = node.loc.start;
            const result = {
                line,
                column,
                value: null,
            };
            if (
                node.arguments.length !== 1 ||
                node.arguments[0].type !== 'Literal'
            ) {
                result.value = node.arguments[0].value || '';
                state.dynamicRequires.push(result);
            } else {
                const value = node.arguments
                    .map(exp => Astring.generate(exp))
                    .join('');

                result.value = _.trim(value, quotes);
                state.requires.push(result);
            }
        }
    },
});

class CodeAnalyzer {
    constructor() {}

    analyze(code) {
        Assert.ok(_.isString(code), 'code(string) required');

        let ast;
        try {
            ast = Acorn.parse(code, {
                allowReturnOutsideFunction: true,
                sourceType: 'module',
                locations: true,
            });
        } catch (error) {
            return {
                status: 'failed',
                message: error.message,
            };
        }

        const results = {
            status: 'ok',
            exportFunctionArguments: [],
            requires: [],
            dynamicRequires: [],
            globals: [],
        };

        AcornWalk.recursive(ast, results, astWalker);

        const globals = {};

        for (const result of AcornGlobals(ast)) {
            for (const node of result.nodes) {
                const { name } = result;
                if (!platformGlobalNames.has(name)) {
                    if (!globals[name]) {
                        globals[name] = 1;
                        const { line, column } = node.loc.start;
                        results.globals.push({
                            line,
                            column,
                            value: name,
                        });
                    }
                }
            }
        }

        return results;
    }
}

module.exports = CodeAnalyzer;

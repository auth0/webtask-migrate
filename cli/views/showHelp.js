const yargs = require('yargs');

module.exports = showHelp;

function showHelp(message) {
    yargs.showHelp();
    console.log();
    console.log(message);
}

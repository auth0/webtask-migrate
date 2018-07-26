const chalk = require('chalk');

module.exports = error;

function error(message) {
    console.log();
    console.log(chalk.red('Error: '), message);
    console.log();
}

const winston = require('winston');
const { format, transports } = winston
const config = require('../config.json');

let combinedLogFile = config.combinedLogFile || "combined.log";
let errorLogFile = config.errorLogFile || "error.log";

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.json(),
  timestamp: function () {
    return (new Date()).toLocaleTimeString();
  },
  // defaultMeta: { service: 'user-service' },
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.File({ filename: errorLogFile, level: 'error' }),
    new winston.transports.File({ filename: combinedLogFile, level: 'info' })
  ],
  exitOnError: false, // do not exit on handled exceptions
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    colorize: true,
    format: format.combine(format.colorize(), format.simple()),
    prettyPrint: true
  }));

  winston.addColors({
      error: 'red',
      warn: 'yellow',
      info: 'cyan',
      debug: 'green'
  });
}

//extending log method of logger to suppport single argument in log function.
function log() {
    if (arguments.length > 1) {
        logger.log(...arguments);
    } else
        logger.info(arguments[0]);
}

module.exports = logger

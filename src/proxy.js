const fs = require('fs');
const axios = require('axios');
const proxyChecker = require('proxy-checker');
const readline = require('readline');
const sleep = require('system-sleep');

const logger = require('./logger');
const config = require('../config.json').proxy;

const proxyFile = config.proxyFile;
const usedProxyFile = config.usedProxyFile;
const proxySourceFile = config.proxySourceFile;
const proxyApi = config.proxyService;
const proxyTestConfig = { url: "http://www.example.com", regex: /Example Domain/ };

const getProxy = function() {
  // Proxy
  // let res = await axios.get("https://api.getproxylist.com/proxy");
  var self = this;

  async function checkProxy(proxy, fileOnly) {
    fileOnly = fileOnly || false;
    logger.debug(`Checking proxy: ${proxy.ipPort}`);
    proxyChecker.checkProxy(
      proxy.ip, proxy.port,
      proxyTestConfig,
      function(host, port, status, statusCode, err) {
        logger.debug(host + ':' + port + ' => '
           + status + ' (status: ' + statusCode + ', err: ' + err + ')');
        saveProxyAsUsed(proxy);
        if (status) {
          saveProxy(proxy);
          self.callback(proxy);
        } else {
          if (fileOnly) {
            getProxyFromFile();
          } else {
            onlineChecker(proxy);
          }
        }
      }
    )
  }

  async function fileChecker(fileOnly) {
    fileOnly = fileOnly || false;
    if (fs.existsSync(proxyFile)) {
      const rl = readline.createInterface({
        input: fs.createReadStream(proxyFile)
      });
      for await (const line of rl) {
        if (!line.trim()) { continue; }
        var split = line.split(':');
        let proxy = {
          ipPort: line,
          ip: split[0],
          port: split[1]
        }
        await checkProxy(proxy, fileOnly);
        return;
      }
      removeProxy();
    }
    if (fileOnly) {
      await getProxyFromFile();
    } else {
      await onlineChecker();
    }
  }

  async function onlineChecker() {
    logger.debug(`Get new proxy from: ${proxyApi}`);
    let res = await axios.get(proxyApi);
    let { data } = res;
    let proxy;
    if (data.ip) { proxy = data; }
    else { proxy = data.data[0]; }
    if (!proxy.ipPort) {
      proxy.ipPort = `${proxy.ip}:${proxy.port}`;
    }
    checkProxy(proxy, false);
  }

  function saveProxy(proxy) {
    fs.writeFile(proxyFile, proxy.ipPort + '\n', function() { logger.debug('Proxy saved.'); });
    // fs.appendFile(proxyFile, proxy.ipPort + '\n', function() { console.log('Proxy saved'); });
  }

  function removeProxy() {
    if (fs.existsSync(proxyFile)) {
      fs.unlinkSync(proxyFile);
      logger.debug("Proxy file removed.");
      sleep(1);
      logger.debug("Sleep done.");
    }
  }

  function saveProxyAsUsed(proxy) {
    fs.appendFile(usedProxyFile, proxy.ipPort + '\n', function() { logger.debug('Proxy saved as used.'); });
  }

  async function isProxyUsedBefore(proxyLine) {
    const rl = readline.createInterface({
      input: fs.createReadStream(usedProxyFile)
    });
    for await (const line of rl) {
      // logger.debug(`Comparing ${line} and ${proxyLine}`);
      if (line == proxyLine) {
        return true;
      }
    }
    return false;
  }

  async function getProxyFromFile() {
    logger.debug(`Get new proxy from: ${proxySourceFile}`);
    const rl = readline.createInterface({
      input: fs.createReadStream(proxySourceFile)
    });
    for await (const line of rl) {
      // logger.debug(`Pick proxy: ${line}`);
      // console.log(line);
      // console.log(await isProxyUsedBefore(line));
      // process.exit();
      if (!await isProxyUsedBefore(line)) {
        fs.writeFileSync(proxyFile, line + '\n');
        await fileChecker(true);
        return;
      } else {
        // logger.debug(`Proxy used before: ${line}`);
      }
    }
  }

  this.getProxy = async function(onlyNew, cb) {
    onlyNew = onlyNew || false;
    self.callback = cb;
    logger.debug(`Get proxy. Only new: ${onlyNew}. Source: ${config.proxySource}`);
    if (onlyNew) {
      removeProxy();
    }
    let fileOnly = config.proxySource == "file";
    await fileChecker(fileOnly);
  }

  return this;
}

module.exports = getProxy()

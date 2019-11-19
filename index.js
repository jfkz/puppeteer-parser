const path = require('path');
const program = require('commander');

const config = require('./config.json');
const proxy = require('./src/proxy');

const browser = require('./src/browser')(config);

const logger = require('./src/logger');

const cwd = process.cwd();
// const currentDir = path.basename(path.dirname(fs.realpathSync(__filename)));

program
  .version('0.0.1')
  .arguments('<file>')
  .action(function(file) {

    const script = require(`./${file}`);
    mainIteration(script, false);
  })
  .parse(process.argv);

function mainIteration(script, useNewProxy) {
  proxy.getProxy(useNewProxy, async function(proxy){
    browser.setProxy(proxy);
    await browser.createBrowser();
    if (script.saveCookies) { await browser.loadCookies(); }
    try {
      await browser.goToPage(script.domain);
    } catch (e) {
      logger.log("Error when opening start page...", e);
      logger.log("Restarting...");
      await browser.shutdown();
      mainIteration(script, true);
      return;
    }
    let classNames = await browser.getClassNames();
    await browser.captureScreenshot();
    if (Array.isArray(classNames)) { // Well, 2gis catch us, so try another one proxy
      // console.log(classNames);
      for(var num in script.actions) {
        let result = await browser.doAction(script.actions[num]);
        await browser.captureScreenshot();
        if (!result) {
          await browser.saveCookies();
          await browser.shutdown();
          mainIteration(script, true);
          return;
        }
      }
      // await browser.savePage();
      await browser.saveCookies();
      await browser.shutdown();
    } else {
      logger.error('Classes not found, restarting....');
      await browser.shutdown();
      mainIteration(script, true);
    }
  });
}

// if (program.file === undefined) console.log('Usage: index [options] <file>');

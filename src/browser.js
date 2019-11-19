const sprintf = require('sprintf-js').sprintf
const puppeteer = require('puppeteer');
const moment = require('moment');
const fs = require('fs');
const jsonfile = require('jsonfile');
const fse = require('fs-extra'); // v 5.0.0
const path = require('path');
const sleep = require('system-sleep');
const { URL } = require('url');
const logger = require('./logger');

var browser = function (config) {

  let self = this;
  this._config = config;

  async function checkBrowser() {
    if (!self._browser || !self._page) {
      await self.createBrowser();
    }
  }

  this.openSamplePage = async function openSamplePage(url) {

    let args = [
      // '--window-size=1920,1080'
    ];

    if(self._proxy) {
      logger.info(`Using proxy: ${self._proxy.ipPort}`);
      args.push(`--proxy-server=${self._proxy.ipPort}`)
    }

    logger.info('Open browser...');
    // Browser

    const browser = await puppeteer.launch({
      args: args
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setDefaultNavigationTimeout(0); // https://stackoverflow.com/questions/52163547/node-js-puppeteer-how-to-set-navigation-timeout
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 120000 } );
      // await page.goto(url);
    } catch(e) {
      console.error(e);
    }

    let screenshotSrc = sprintf("%s/%s%d-%s.png",
      self._config.screenshotsDir,
      'screenshot',
      moment().unix(),
      url.replace(/[^a-zA-Z0-9-_]/g, '')
    );
    logger.info(`Save screenshot to: ${screenshotSrc}`);
    await page.screenshot({path: screenshotSrc});

    await browser.close();
    logger.info('bye!');
  }

  this.createBrowser = async function() {
    let launchConfig = JSON.parse(JSON.stringify(self._config.chromeLaunchConfig || {}));
    let args = [
      // '--window-size=1920,1080'
    ]


    let viewport = { width: 1920, height: 1080 };
    if (self._config.viewports) {
      viewport = self._config.viewports[Math.floor(Math.random()*self._config.viewports.length)];
    }

    if (self._proxy) {
      logger.info(`Using proxy: ${self._proxy.ipPort}`);
      args.push(`--proxy-server=${self._proxy.ipPort}`);
    }


    // Browser
    launchConfig.args = (launchConfig.args || []).concat(args);

    logger.info('Creating browser...');
    logger.debug("Launch config: ", launchConfig);

    self._browser = await puppeteer.launch({
      args: args
    });
    self._page = await self._browser.newPage();

    await self._page.setViewport(viewport);
    logger.info("Viewport size: ", viewport);

    await self._page.setDefaultNavigationTimeout(0); // https://stackoverflow.com/questions/52163547/node-js-puppeteer-how-to-set-navigation-timeout

    if (self._config.debug) {
      self._page.on('request', async (request) => {
        logger.debug("Request: ", { "type": request.resourceType(), "url": request.url() } );
      });
      self._page.on('console', msg => logger.debug('PAGE LOG:', msg.text()));
      // await page.evaluate(() => console.log(`url is ${location.href}`));
    }

    return self;
  }

  this.goToPage = async function (url){
    await checkBrowser();

    logger.info(`Opening page: ${url}...`);

    let timeout = self._config.navigationTimeout || 30;
    timeout = timeout * 1000;
    try {
      await self._page.goto(url, { waitUntil: 'load', timeout: timeout } );
      self._lasturl = url;
      // await page.goto(url);
    } catch(e) {
      console.error(e);
    }

    // await self._page.waitForNavigation({
    //   "waitUntil": "domcontentloaded"
    // }), // The promise resolves after navigation has finished

    logger.info("Page opened.");

    return self;
  }

  this.setProxy = function(proxy) {
    this._proxy = proxy;
  }

  this.saveCookies = async function () {
    // Save Session Cookies
    const cookiesObject = await self._page.cookies();
    // Write cookies to temp file to be used in other profile pages
    jsonfile.writeFile(this._config.cookieFile, cookiesObject, { spaces: 2 },
      function(err) {
        if (err) {
          logger.info('The file could not be written.', err)
        }
        logger.info('Session has been successfully saved')
      }
    );
  }

  this.loadCookies = async function () {
    let cookiesFilePath = this._config.cookieFile;
    const previousSession = fs.existsSync(cookiesFilePath);
    if (previousSession) {
      // If file exist load the cookies
      const cookiesArr = require(`../${cookiesFilePath}`)
      if (cookiesArr.length !== 0) {
        for (let cookie of cookiesArr) {
          await self._page.setCookie(cookie)
        }
        logger.info('Session has been loaded in the browser')
        return true
      }
    }
  }

  function cleanUrl(url) {
    return url.replace('https://', '').replace(/[^a-zA-Z0-9-_]/g, '_');
  }

  function makeFileName(folder, prefix, extension) {
    let url = '';
    if (self._lasturl) {
      url = cleanUrl(self._lasturl);
    }
    return sprintf("%s/%s%d-%s%s",
      folder,
      prefix,
      moment().unix(),
      url,
      extension
    );
  }

  this.captureScreenshot = async function () {
    let screenshotSrc = makeFileName(self._config.screenshotsDir, "screenshot", ".png");
    await self._page.screenshot({path: screenshotSrc});
    logger.info(`Screenshot saved to: ${screenshotSrc}`);
  }

  this.savePage = async function () {
    let htmlSrc = makeFileName(self._config.htmlDumpDir, "page", ".html");
    const html = await self._page.content();
    fs.writeFile(htmlSrc, html, function() { logger.info(`Page saved to: ${htmlSrc}`); });
  }

  this.shutdown = async function () {
    if (self._browser) {
      await self._browser.close();
    }
  }

  this.getClassNames = async function (script) {
    checkBrowser();
    self._classNames = await self._page.evaluate(() => window.__classNames)
    if (self._classNames) {
      logger.info(`Classnames founded: ${self._classNames.length}`);
    } else {
      logger.error('Classnames not found');
    }
    return self._classNames;
  }

  this.doAction = async function (action) {
    logger.info("Doing action: ", action);
    if (action.saveAllData) { saveAllData(); }
    if (!action.type) { return true; }
    switch (action.type) {
      case "click":
        let className = self._classNames[action.classId];
        try {
          const [response] = await Promise.all([
            self._page.waitForNavigation({
              "waitUntil": "networkidle2"
            }), // The promise resolves after navigation has finished
            self._page.click(`.${className}`, { delay: 500 }), // Clicking the link will indirectly cause a navigation
            // logger.info(`Clicked on ${className}`),
          ]);
        } catch (e) {
          console.error("Error on click: ", e);
        }
        break;
      default:
    }
    let title = await self._page.title();
    if (title.indexOf(action.titleToDecline) >= 0) { return false; }
    if (action.timeout) { sleep(1000 * action.timeout); }
    return true;
  }

  async function saveAllData() {
    let dataDir = makeFileName(self._config.htmlDumpDir, "page", "/");
    // fs.mkdirSync(dataDir);
    self._page.on('response', async (response) => {
      logger.debug("Response: ", { "type": response.headers()['content-type'], "url": response.url().length } );
      if (!(response.url().indexOf('data:image/') >= 0)) { // dont save shitty data/image
         const url = new URL(response.url());
         let filePath = path.resolve(`${dataDir}${url.pathname}`);
         if (path.extname(url.pathname).trim() === '') {
           filePath = `${filePath}/index.html`;
         }
         try {
           await fse.outputFile(filePath, await response.buffer());
         } catch (e) {
           console.error("Error when saving file: ", e);
         }
       }
     });
  }

  return this;
}


module.exports = browser;

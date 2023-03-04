// Created by Robins
// 4th March 2023

const puppeteer = require("puppeteer");
const _ = require("lodash");
const validator = require("validator");
const cheerio = require("cheerio");
var fs = require("fs");

class Crawler {
  constructor(url, depth) {
    url = _.replace(url, /\/$/, "");
    this.url = url;
    this.depthLimit = depth;
    this.images = [];
    this.urlCrawled = {};
  }

  async initCrawl() {
    const currentDepth = 0;
    const $ = await this.connect(this.url, currentDepth);
    this.findAllImages($, this.url, currentDepth, this.images);
    const linkedUrls = await this.findAllLinkedUrls($, this.url);
    if (currentDepth < this.depthLimit && linkedUrls && linkedUrls.length) {
      for (const linkedUrl of linkedUrls) {
        try {
         
          await this.recursiveCrawlTillDepthReached(
            linkedUrl,
            currentDepth + 1
          );
        } catch (error) {
          console.error(error);
        }
      }
    }
    return this.save();
  }

  async recursiveCrawlTillDepthReached(targetUrl, currentDepth) {
    const $ = await this.connect(targetUrl, currentDepth);
    this.findAllImages($, targetUrl, currentDepth, this.images);
    if (currentDepth < this.depthLimit) {
      const linkedUrls = await this.findAllLinkedUrls($, targetUrl);
      if (linkedUrls && linkedUrls.length) {
        const promises = [];
        for (const linkedUrl of linkedUrls) {
          promises.push(
            this.recursiveCrawlTillDepthReached(linkedUrl, currentDepth + 1)
          );
        }
        await Promise.allSettled(promises);
      }
    }
  }

  async connect(url, depth) {
    let $;
    const browser = await puppeteer.launch();
    try {
      console.log("Connecting to:", url, " Depth:", depth);
      const page = await browser.newPage();
      // Set screen size
      await page.setViewport({ width: 1080, height: 1024 });
      const document = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      console.log("Connected");
      const html = await document.text();
      $ = cheerio.load(html);
    } catch (error) {
      console.error(error.message);
      await browser.close();
    } finally {
      browser.close();
    }
    return $;
  }

  save() {
    return new Promise((resolve, reject) => {
      var json = JSON.stringify({
        results: this.images,
      });
      fs.writeFile("results.json", json, "utf8", resolve);
    });
  }

  getUrlDomain(url){
    const patt = /^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)/;
    url = _.get(url.match(patt), "[0]");
    return url;
  }

  getAbsUrl(url, sourceUrl){
    if(!validator.isURL(url)){
      const isNotAbsUrlPatt = /^\//;
      if (isNotAbsUrlPatt.test(url)) {
        const domain = this.getUrlDomain(sourceUrl);
        url = `${domain}${url}`;
      }
    }
    return url;
  }

  async findAllImages($, sourceUrl, depth, images) {
    const that = this;
    if ($) {
      $("img").map(function () {
        let imageUrl = $(this).attr("src");
        if (!that.urlCrawled[imageUrl]) {
          that.urlCrawled[imageUrl] = true;
          imageUrl = that.getAbsUrl(imageUrl, sourceUrl);
          if (validator.isURL(imageUrl)) {
            images.push({
              imageUrl,
              sourceUrl,
              depth,
            });
          }
          // console.log(imageUrl);
        }
      });
    }
  }

  isSamePageUrl(url, parentUrl){
    const domain = this.getUrlDomain(parentUrl);
    const urlPattern = new RegExp(`${domain}.+`);
    return urlPattern.test(url);
  }

  async findAllLinkedUrls($, parentUrl) {
    const urls = [];
    const that = this;
    parentUrl = parentUrl.replace(/\/$/, "");

    $("a").each(function (i, link) {
      let url = $(link).attr("href");
      url = _.replace(url, /\/$/, "");
      if (url) {
        url = that.getAbsUrl(url, parentUrl);
        if (that.isSamePageUrl(url, parentUrl) && validator.isURL(url)) {
          urls.push(url);
        }
      }
    });
    return urls;
  }
} // End Crawler

const error = (type) => {
  const pattern = `node crawler.js <url> <depth>`;
  if (type) {
    console.error(`Invalid ${type}! \nCLI usage: ${pattern}`);
  } else {
    console.error(`Invalid Usage. \nCLI usage: ${pattern}`);
  }
};

// Initialize
const init = () => {
  const args = process.argv.slice(2);
  const url = _.get(args, "[0]", "");
  const depth = _.parseInt(_.get(args, "[1]", 0));
  let isError = false;
  if (!validator.isURL(url)) {
    error("URL");
    isError = true;
  }
  if (typeof depth !== "number") {
    error("Depth");
    isError = true;
  }

  if (!isError) {
    const crawl = new Crawler(url, depth);
    crawl.initCrawl().catch(console.error);
  }
};
// TODO:
// Add retry for pages
// Add page recrawl..

// Run the crawler
init();

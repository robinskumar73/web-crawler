// Created by Robins
// 4th March 2023

const puppeteer = require("puppeteer");
const _ = require("lodash");
const validator = require("validator");
const cheerio = require("cheerio");

class Crawler {
  constructor(url, depth) {
    this.url = url;
    this.depthLimit = depth;
    this.images = [];
    this.urlCrawled = {};
  }

  async initCrawl() {
    const currentDepth = 0;
    const $ = await this.connect(this.url, currentDepth);
    this.findAllImages($, this.url, 0, this.images);
    const linkedUrls = await this.findAllLinkedUrls($, this.url);
    if(currentDepth < this.depthLimit && linkedUrls && linkedUrls.length){
      for(const linkedUrl of linkedUrls){
        await this.recursiveCrawlTillDepthReached(linkedUrl, currentDepth+1);
      }
    }

    console.log("All Images", this.images);
  }

  async recursiveCrawlTillDepthReached(targetUrl, currentDepth) {
    const $ = await this.connect(targetUrl, currentDepth);
    this.findAllImages($, targetUrl, 0, this.images);
    if(currentDepth < this.depthLimit){
      const linkedUrls = await this.findAllLinkedUrls($, targetUrl);
      if(linkedUrls && linkedUrls.length){
        const promises = []
        for(const linkedUrl of linkedUrls){
          promises.push(this.recursiveCrawlTillDepthReached(linkedUrl, currentDepth+1));
        }
        await Promise.all(promises);
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

  async findAllImages($, sourceUrl, depth, images) {
    const that = this;
    if($){
      $("img").map(function () {
        const imageUrl = $(this).attr("src");
        if (!that.urlCrawled[imageUrl]) {
          that.urlCrawled[imageUrl] = true;
          // console.log(imageUrl);
          images.push({
            imageUrl,
            sourceUrl,
            depth,
          });
        }
      });
    }
  }

  async findAllLinkedUrls($, parentUrl) {
    const urls = [];
    parentUrl = parentUrl.replace(/\/$/, "");
    const urlPattern = new RegExp(`${parentUrl}.+`);
    $("a").each(function (i, link) {
      let url = $(link).attr("href");
      url = url.replace(/\/$/, "");
      if (urlPattern.test(url)) {
        urls.push(url);
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
  const url = _.get(args, "[0]");
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

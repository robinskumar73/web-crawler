// Created by Robins
// 4th March 2023

const puppeteer = require("puppeteer");
const _ = require("lodash");
const validator = require("validator");
const cheerio = require("cheerio");
const fs = require("fs");
const axios = require("axios");


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
    await this.downloadImage();
    return this.save();
  }

  makeid(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
}

  async downloadImage() {
    for (let image of this.images) {
      console.log("Downloading image", image.imageUrl);
      const arrayBuffer = await axios.get(image.imageUrl, {
        responseType: "arraybuffer",
      });
      const buffer = Buffer.from(arrayBuffer.data, "binary").toString("base64");
      const imageData = `data:${arrayBuffer.headers["content-type"]};base64,${buffer}`;
      console.log(imageData);
      let imageName = this.makeid(10);
      const imagePath = `images/${imageName}.jpg`;
      console.log("Saving", imagePath);
      await this.save(imagePath, imageData);
    }
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
        waitUntil: "networkidle0",
        timeout: 600000,
      });
      const data = await page.evaluate(
        () => document.querySelector("*").outerHTML
      );
      // console.log(data);
      // await page.waitForNavigation({
      //   waitUntil: 'networkidle0',
      // });
      await this.save("data.html", data);
      // fs.writeFile("data.html", data, "utf8");
      console.log("Connected");
      // const html = await document.text();
      $ = cheerio.load(data);
    } catch (error) {
      console.error(error.message);
      await browser.close();
    } finally {
      browser.close();
    }
    return $;
  }

  save(file, data) {
    return new Promise((resolve, reject) => {
      if (file) {
        fs.writeFile(file, data, "utf8", resolve);
      } else {
        var json = JSON.stringify({
          results: this.images,
        });
        fs.writeFile("results.json", json, "utf8", resolve);
      }
    });
  }

  getUrlDomain(url) {
    const patt = /^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)/;
    url = _.get(url.match(patt), "[0]");
    return url;
  }

  checkforDoubleSlash(url) {
    const patt = /^\/\//;
    url = _.replace(url, patt, "");

    return url;
  }

  checkForProtocol(url) {
    const patt = /^https?\:\/\/.+/;
    const isUrl = validator.isURL(url);
    if (isUrl && !patt.test(url)) {
      url = `https://${url}`;
    }
    return url;
  }

  getAbsUrl(url, sourceUrl) {
    url = this.checkforDoubleSlash(url);
    url = this.checkForProtocol(url);
    if (!validator.isURL(url)) {
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

      $("a").map(function () {
        const item = $(this).attr("style");
        if (item) {
          const patt = /background\-image\: url\(\/\//;
          let imageUrl = _.replace(item, patt, "");
          imageUrl = _.replace(imageUrl, /\)\;$/, "");
          // const urls = item.match(patt);
          // console.log(url);
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
        }
      });
    }
  }

  isSamePageUrl(url, parentUrl) {
    const domain = this.getUrlDomain(parentUrl);
    const urlPattern = new RegExp(`${domain}.+`);
    return urlPattern.test(url);
  }

  async findAllLinkedUrls($, parentUrl) {
    const urls = [];
    const urlObj = {};
    const that = this;
    parentUrl = parentUrl.replace(/\/$/, "");

    $("a").each(function (i, link) {
      let url = $(link).attr("href");
      url = _.replace(url, /\/$/, "");
      if (url) {
        url = that.getAbsUrl(url, parentUrl);
        if (that.isSamePageUrl(url, parentUrl) && validator.isURL(url)) {
          if (!urlObj[url]) {
            urls.push(url);
            urlObj[url] = true;
          }
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

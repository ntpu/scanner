'use strict';

const launchChrome = require('@serverless-chrome/lambda');
const request = require('superagent');
const puppeteer = require('puppeteer-core');

const getChrome = async () => {
  const chrome = await launchChrome();

  const response = await request
    .get(`${chrome.url}/json/version`)
    .set("Content-Type", "application/json");

  return {
    endpoint: response.body.webSocketDebuggerUrl,
    instance: chrome
  };
};

const scan = async (event) => {
  const chrome = await getChrome();
  console.log('Chrome started...');

  const browser = await puppeteer.connect({
    browserWSEndpoint: chrome.endpoint
  });
  const page = await browser.newPage();

  const {origin, destination, departureDate, arrivalDate} = event;
  const pageUrl = 'https://www.google.com/flights#flt=' + origin + '.' + destination + '.' + departureDate + '*' +
    destination + '.' + origin + '.' + arrivalDate + ';c:USD;e:1;sc:b;so:1;sd:1;t:f';
  await page.goto(pageUrl);
  console.log('Go to page: ' + pageUrl);

  console.log('Page title: ' + await page.title());

  // Parsing carrier and price info etc...
  await page.waitFor('.gws-flights-results__result-list');
  const items = await page.$$('.gws-flights-results__result-item');
  const flights = await Promise.all(items.map(async item => {
    const carrier = await item.$eval('.gws-flights-results__carriers', c => c.innerText);
    const priceString = await item.$eval('.gws-flights-results__price', p => p.innerText);
    const numStopsString = await item.$eval('.gws-flights-results__stops', s => s.innerText);
    const price = parseFloat(priceString.replace(/[^0-9.-]+/g, ''));
    const numStops = numStopsString === 'Nonstop' ? 0 : parseInt(numStopsString);
    return {
      'carrier': carrier,
      'price': price,
      'numStop': numStops
    }
  }));

  await browser.close();
  return {
    'origin': origin,
    'destination': destination,
    'departureDate': departureDate,
    'arrivalDate': arrivalDate,
    'flights': flights
  };
};

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  const flightList = await scan(event);
  console.log(flightList);
  return `Successfully processed messages.`;
};

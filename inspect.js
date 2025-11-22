const axios = require('axios');
const cheerio = require('cheerio');
const UserAgent = require('user-agents');

const url = "https://www.bilibili.com/video/BV1dvCtB5EyH?vd_source=f5d8261c2bceb32cff0485d7a3c2c443";
const userAgent = new UserAgent({ deviceCategory: 'desktop' }).toString();

async function inspect() {
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': userAgent } });
    const $ = cheerio.load(data);
    let initialState = null;

    $('script').each((i, el) => {
      const content = $(el).html();
      if (content && content.includes('window.__INITIAL_STATE__=')) {
        const jsonStr = content.split('window.__INITIAL_STATE__=')[1].split(';')[0];
        initialState = JSON.parse(jsonStr);
      }
    });

    if (initialState) {
      console.log('Keys in initialState:', Object.keys(initialState));
      if (initialState.sections) {
        console.log('Found sections (collections):', JSON.stringify(initialState.sections, null, 2));
      }
      if (initialState.videoData && initialState.videoData.pages) {
        console.log('Found pages (multi-part):', initialState.videoData.pages.length);
        console.log('First page:', initialState.videoData.pages[0]);
      }
      if (initialState.ugc_season) {
        console.log('Found ugc_season (season/collection):', JSON.stringify(initialState.ugc_season, null, 2));
      }
    } else {
      console.log('No INITIAL_STATE found');
    }

  } catch (e) {
    console.error(e);
  }
}

inspect();

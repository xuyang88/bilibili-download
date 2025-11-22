const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const ffmpeg = require('fluent-ffmpeg');
const { program } = require('commander');
const cliProgress = require('cli-progress');
const UserAgent = require('user-agents');

program
  .version('1.0.0')
  .argument('<url>', 'Bilibili video URL')
  .option('-o, --output <path>', 'Output file path')
  .parse(process.argv);

const videoUrl = program.args[0];
const options = program.opts();

const userAgent = new UserAgent({ deviceCategory: 'desktop' }).toString();
const headers = {
  'User-Agent': userAgent,
  'Referer': 'https://www.bilibili.com/',
  'Cookie': 'SESSDATA=; buvid3=;' // Sometimes needed, but let's try without first or with empty
};

async function main() {
  try {
    console.log(`Fetching video info from: ${videoUrl}`);
    const response = await axios.get(videoUrl, { headers });
    const html = response.data;
    const $ = cheerio.load(html);

    // Extract __playinfo__
    let playInfo = null;
    let initialState = null;

    $('script').each((i, el) => {
      const content = $(el).html();
      if (content && content.includes('window.__playinfo__=')) {
        try {
          const jsonStr = content.split('window.__playinfo__=')[1].split(';')[0];
          playInfo = JSON.parse(jsonStr);
        } catch (e) {
          console.error('Error parsing __playinfo__:', e);
        }
      }
      if (content && content.includes('window.__INITIAL_STATE__=')) {
        try {
          const jsonStr = content.split('window.__INITIAL_STATE__=')[1].split(';')[0];
          initialState = JSON.parse(jsonStr);
        } catch (e) {
          console.error('Error parsing __INITIAL_STATE__:', e);
        }
      }
    });

    if (!playInfo) {
      console.error('Could not find video info (playinfo). The page might be captcha blocked or structure changed.');
      // Dump HTML for debugging if needed
      fs.writeFileSync('debug.html', html);
      return;
    }

    const title = initialState?.videoData?.title || 'video';
    const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '_');
    console.log(`Video Title: ${title}`);

    // Get video and audio streams (dash)
    const dash = playInfo.data?.dash;
    if (!dash) {
      console.error('No DASH stream found.');
      return;
    }

    // Select best video (highest bandwidth/id) and audio
    const videoStream = dash.video.sort((a, b) => b.bandwidth - a.bandwidth)[0];
    const audioStream = dash.audio.sort((a, b) => b.bandwidth - a.bandwidth)[0];

    console.log(`Video Quality: ${videoStream.width}x${videoStream.height}`);

    const tempVideoPath = path.resolve(`${sanitizedTitle}_video.m4s`);
    const tempAudioPath = path.resolve(`${sanitizedTitle}_audio.m4s`);
    const outputPath = options.output || path.resolve(`${sanitizedTitle}.mp4`);

    // Download function
    const downloadFile = async (url, filepath, type) => {
      const writer = fs.createWriteStream(filepath);
      const { data, headers: responseHeaders } = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: {
          ...headers,
          'Referer': videoUrl // Important for Bilibili
        }
      });

      const totalLength = responseHeaders['content-length'];
      const progressBar = new cliProgress.SingleBar({
        format: `${type} | {bar} | {percentage}% | {value}/{total} Bytes`,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
      });

      progressBar.start(parseInt(totalLength), 0);

      data.on('data', (chunk) => progressBar.increment(chunk.length));
      data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          progressBar.stop();
          resolve();
        });
        writer.on('error', reject);
      });
    };

    console.log('Downloading video stream...');
    await downloadFile(videoStream.baseUrl, tempVideoPath, 'Video');

    console.log('Downloading audio stream...');
    await downloadFile(audioStream.baseUrl, tempAudioPath, 'Audio');

    console.log('Merging video and audio...');

    ffmpeg()
      .input(tempVideoPath)
      .input(tempAudioPath)
      .outputOptions('-c:v copy')
      .outputOptions('-c:a copy')
      .save(outputPath)
      .on('end', () => {
        console.log(`\nDownload complete! Saved to: ${outputPath}`);
        // Cleanup
        fs.unlinkSync(tempVideoPath);
        fs.unlinkSync(tempAudioPath);
      })
      .on('error', (err) => {
        console.error('Error merging files:', err);
      });

  } catch (error) {
    console.error('An error occurred:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
    }
  }
}

main();

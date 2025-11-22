const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const ffmpeg = require('fluent-ffmpeg');
const { program } = require('commander');
const cliProgress = require('cli-progress');
const inquirer = require('inquirer');

program
  .version('1.0.0')
  .argument('<url>', 'Bilibili video URL')
  .option('-o, --output <path>', 'Output directory path')
  .option('-a, --all', 'Download all videos in collection')
  .option('-i, --indices <indices>', 'Comma-separated indices of videos to download (1-based)')
  .parse(process.argv);

const videoUrl = program.args[0];
const options = program.opts();

// Use a fixed, modern User-Agent
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const headers = {
  'User-Agent': userAgent,
  'Referer': 'https://www.bilibili.com/',
  // 'Cookie': '' // Removed empty cookie to avoid issues
};

async function downloadSingleVideo(bvid, cid, title, outputDir) {
  const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '_');
  const finalOutputPath = path.join(outputDir, `${sanitizedTitle}.mp4`);

  if (fs.existsSync(finalOutputPath)) {
    console.log(`Skipping ${title}, already exists.`);
    return;
  }

  console.log(`\nProcessing: ${title}`);

  try {
    const apiUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=16`;
    const { data: playInfo } = await axios.get(apiUrl, { headers });

    if (playInfo.code !== 0) {
      console.error(`Error fetching playinfo for ${title}: ${playInfo.message}`);
      return;
    }

    const dash = playInfo.data?.dash;
    if (!dash) {
      console.error(`No DASH stream found for ${title}.`);
      return;
    }

    const videoStream = dash.video.sort((a, b) => b.bandwidth - a.bandwidth)[0];
    const audioStream = dash.audio.sort((a, b) => b.bandwidth - a.bandwidth)[0];

    const tempVideoPath = path.join(outputDir, `${sanitizedTitle}_video.m4s`);
    const tempAudioPath = path.join(outputDir, `${sanitizedTitle}_audio.m4s`);

    // Download function
    const downloadFile = async (url, filepath, type) => {
      const writer = fs.createWriteStream(filepath);
      const { data, headers: responseHeaders } = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: {
          ...headers,
          'Referer': videoUrl
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

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(tempVideoPath)
        .input(tempAudioPath)
        .outputOptions('-c:v copy')
        .outputOptions('-c:a copy')
        .save(finalOutputPath)
        .on('end', () => {
          console.log(`Done: ${finalOutputPath}`);
          fs.unlinkSync(tempVideoPath);
          fs.unlinkSync(tempAudioPath);
          resolve();
        })
        .on('error', (err) => {
          console.error('Error merging files:', err);
          reject(err);
        });
    });

  } catch (e) {
    console.error(`Failed to download ${title}:`, e.message);
  }
}

async function main() {
  try {
    console.log(`Fetching video info from: ${videoUrl}`);
    const response = await axios.get(videoUrl, { headers });
    const html = response.data;
    const $ = cheerio.load(html);

    let initialState = null;

    $('script').each((i, el) => {
      const content = $(el).html();
      if (content && content.includes('window.__INITIAL_STATE__=')) {
        try {
          const jsonStr = content.split('window.__INITIAL_STATE__=')[1].split(';')[0];
          initialState = JSON.parse(jsonStr);
        } catch (e) {
          console.error('Error parsing __INITIAL_STATE__:', e);
        }
      }
    });

    if (!initialState) {
      console.error('Could not find video info. Page might be blocked.');
      return;
    }

    const bvid = initialState.bvid || initialState.videoData?.bvid;
    const pages = initialState.videoData?.pages || [];

    let videosToDownload = [];
    const outputDir = options.output || process.cwd();

    if (pages.length > 1) {
      console.log(`Found ${pages.length} videos in this collection.`);

      if (options.all) {
        videosToDownload = pages;
      } else if (options.indices) {
        const indices = options.indices.split(',').map(i => parseInt(i.trim())).filter(i => !isNaN(i));
        videosToDownload = pages.filter(p => indices.includes(p.page));
      } else {
        const choices = pages.map(p => ({
          name: `[P${p.page}] ${p.part}`,
          value: p
        }));

        const { selectedVideos } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selectedVideos',
            message: 'Select videos to download:',
            choices: choices,
            pageSize: 20
          }
        ]);
        videosToDownload = selectedVideos;
      }

      if (videosToDownload.length === 0) {
        console.log('No videos selected.');
        return;
      }
    } else {
      // Single video
      videosToDownload = [{
        cid: initialState.videoData.cid,
        part: initialState.videoData.title
      }];
    }

    console.log(`Starting download for ${videosToDownload.length} videos...`);

    for (const video of videosToDownload) {
      await downloadSingleVideo(bvid, video.cid, video.part, outputDir);
    }

    console.log('\nAll tasks completed!');

  } catch (error) {
    console.error('An error occurred:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
    }
  }
}

main();

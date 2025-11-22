# Bilibili Video Downloader

A Node.js command-line tool to download videos from Bilibili. It supports downloading single videos as well as video collections.

## Features

- **High Quality**: Automatically selects the highest available quality for video and audio.
- **Collection Support**: Detects if a URL is part of a collection and allows you to choose which videos to download.
- **Interactive Selection**: Provides an interactive menu to select videos from a collection.
- **Existing File Detection**: Automatically detects and marks already downloaded videos in the selection menu.
- **Batch Download**: Supports downloading all videos or specific indices via CLI arguments.
- **Auto-Merge**: Uses FFmpeg to merge video and audio streams into a single MP4 file.

## Prerequisites

- **Node.js**: Ensure Node.js is installed.
- **FFmpeg**: This tool requires FFmpeg to merge video and audio streams. Make sure it is installed and available in your system's PATH.

## Installation

1. Clone this repository or copy the files.
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Basic Usage

Run the script with a Bilibili video URL:

```bash
node index.js "https://www.bilibili.com/video/BV1..."
```

If the video is part of a collection, an interactive menu will appear letting you select which videos to download.

### Command Line Options

- `-o, --output <path>`: Specify the output directory (default is current directory).
- `-a, --all`: Download all videos in the collection automatically.
- `-i, --indices <indices>`: Download specific videos by index (comma-separated, 1-based).

### Examples

**Download a single video or interactively select from a collection:**
```bash
node index.js "https://www.bilibili.com/video/BV1dvCtB5EyH"
```

**Download all videos in a collection:**
```bash
node index.js "https://www.bilibili.com/video/BV1dvCtB5EyH" --all
```

**Download specific episodes (e.g., 1st, 3rd, and 5th):**
```bash
node index.js "https://www.bilibili.com/video/BV1dvCtB5EyH" -i 1,3,5
```

**Save to a specific directory:**
```bash
node index.js "https://www.bilibili.com/video/BV1dvCtB5EyH" -o ./downloads
```

## Troubleshooting

- **412 Error**: If you encounter a 412 error, it usually means the User-Agent or Referer headers are rejected. The tool uses a fixed modern User-Agent to mitigate this.
- **FFmpeg Error**: If merging fails, ensure FFmpeg is correctly installed and accessible from your terminal.

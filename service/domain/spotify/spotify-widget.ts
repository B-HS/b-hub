import type { createCache } from '../../shared/cache'
import type { SpotifyDataService } from './spotify-data'

type NowPlayingData = {
    isPlaying: boolean
    track: {
        name: string
        artist: string
        album: string
        albumArt: string | null
        externalUrl: string | null
        durationMs: number
        progressMs: number | null
    } | null
    lastPlayedAt: string | null
}

type SpotifyWidgetServiceDeps = {
    spotifyDataService: SpotifyDataService
    albumArtCache: ReturnType<typeof createCache<string>>
}

const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
}

const truncateText = (text: string, maxLen: number) => (text.length > maxLen ? text.slice(0, maxLen) + '...' : text)

const escapeXml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const fetchAlbumArtBase64 = async (url: string, cache: ReturnType<typeof createCache<string>>): Promise<string> => {
    const cached = cache.get(url)
    if (cached) return cached

    try {
        const res = await fetch(url)
        if (!res.ok) return ''
        const buffer = await res.arrayBuffer()
        const contentType = res.headers.get('content-type') ?? 'image/jpeg'
        const base64 = `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`
        cache.set(url, base64)
        return base64
    } catch {
        return ''
    }
}

const generateNotPlayingSvg = () => {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="140" viewBox="0 0 480 140">
  <style>
    .title { font: bold 14px 'Segoe UI', Ubuntu, sans-serif; fill: #fff; }
    .subtitle { font: 12px 'Segoe UI', Ubuntu, sans-serif; fill: #b3b3b3; }
  </style>
  <rect width="480" height="140" rx="12" fill="#191414"/>
  <rect x="20" y="20" width="100" height="100" rx="8" fill="#282828"/>
  <g transform="translate(55, 58)">
    <circle cx="15" cy="15" r="14" stroke="#535353" stroke-width="2" fill="none"/>
    <path d="M12 10 L12 20 L20 15 Z" fill="#535353"/>
  </g>
  <text x="140" y="58" class="title">Not Playing</text>
  <text x="140" y="78" class="subtitle">Spotify</text>
</svg>`
}

export const createSpotifyWidgetService = (deps: SpotifyWidgetServiceDeps) => {
    const getNowPlayingData = async (spotifyAccountId: number): Promise<NowPlayingData> => {
        return deps.spotifyDataService.getNowPlaying(spotifyAccountId)
    }

    const generateSvg = async (spotifyAccountId: number): Promise<string> => {
        const data = await getNowPlayingData(spotifyAccountId)

        if (!data.track) return generateNotPlayingSvg()

        const { track, isPlaying } = data
        const trackName = escapeXml(truncateText(track.name, 30))
        const artistName = escapeXml(truncateText(track.artist, 35))
        const progressMs = track.progressMs ?? 0
        const durationMs = track.durationMs || 1
        const progressPct = Math.min((progressMs / durationMs) * 100, 100)
        const progressTime = formatTime(progressMs)
        const durationTime = formatTime(durationMs)

        let albumArtTag = '<rect x="20" y="20" width="100" height="100" rx="8" fill="#282828"/>'
        if (track.albumArt) {
            const base64 = await fetchAlbumArtBase64(track.albumArt, deps.albumArtCache)
            if (base64) {
                albumArtTag = `<clipPath id="art-clip"><rect x="20" y="20" width="100" height="100" rx="8"/></clipPath>
    <image href="${base64}" x="20" y="20" width="100" height="100" clip-path="url(#art-clip)" preserveAspectRatio="xMidYMid slice"/>`
            }
        }

        const equalizerBars = isPlaying
            ? `<g transform="translate(430, 30)">
      <style>
        @keyframes eq1 { 0%,100% { height: 8px; y: 12px; } 50% { height: 20px; y: 0; } }
        @keyframes eq2 { 0%,100% { height: 14px; y: 6px; } 50% { height: 8px; y: 12px; } }
        @keyframes eq3 { 0%,100% { height: 10px; y: 10px; } 50% { height: 18px; y: 2px; } }
        .bar1 { animation: eq1 0.8s ease-in-out infinite; }
        .bar2 { animation: eq2 0.6s ease-in-out infinite; }
        .bar3 { animation: eq3 0.7s ease-in-out infinite; }
      </style>
      <rect class="bar1" x="0" y="12" width="6" height="8" rx="2" fill="#1DB954"/>
      <rect class="bar2" x="10" y="6" width="6" height="14" rx="2" fill="#1DB954"/>
      <rect class="bar3" x="20" y="10" width="6" height="10" rx="2" fill="#1DB954"/>
    </g>`
            : `<g transform="translate(430, 30)">
      <rect x="0" y="14" width="6" height="6" rx="2" fill="#535353"/>
      <rect x="10" y="10" width="6" height="10" rx="2" fill="#535353"/>
      <rect x="20" y="12" width="6" height="8" rx="2" fill="#535353"/>
    </g>`

        const statusLabel = isPlaying ? 'Now Playing' : 'Last Played'

        return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="140" viewBox="0 0 480 140">
  <style>
    .status { font: 11px 'Segoe UI', Ubuntu, sans-serif; fill: #1DB954; text-transform: uppercase; letter-spacing: 1px; }
    .title { font: bold 14px 'Segoe UI', Ubuntu, sans-serif; fill: #fff; }
    .artist { font: 12px 'Segoe UI', Ubuntu, sans-serif; fill: #b3b3b3; }
    .time { font: 11px 'Segoe UI', Ubuntu, sans-serif; fill: #b3b3b3; }
  </style>
  <rect width="480" height="140" rx="12" fill="#191414"/>
  ${albumArtTag}
  ${equalizerBars}
  <text x="140" y="40" class="status">${statusLabel}</text>
  <text x="140" y="62" class="title">${trackName}</text>
  <text x="140" y="82" class="artist">${artistName}</text>
  <rect x="140" y="100" width="270" height="4" rx="2" fill="#404040"/>
  <rect x="140" y="100" width="${((270 * progressPct) / 100).toFixed(1)}" height="4" rx="2" fill="#1DB954"/>
  <text x="140" y="122" class="time">${progressTime} / ${durationTime}</text>
</svg>`
    }

    const generateHtmlWidget = (token: string, baseUrl: string): string => {
        const dataUrl = `${baseUrl}/api/spotify/playing/${token}/data`

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=480"/>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 480px; height: 140px; overflow: hidden; font-family: 'Segoe UI', Ubuntu, sans-serif; background: transparent; }
.card { width: 480px; height: 140px; background: #191414; border-radius: 12px; position: relative; display: flex; align-items: center; padding: 20px; gap: 20px; }
.art { width: 100px; height: 100px; border-radius: 8px; background: #282828; flex-shrink: 0; object-fit: cover; }
.info { flex: 1; min-width: 0; }
.status { font-size: 11px; color: #1DB954; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
.name { font-size: 14px; font-weight: bold; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
.artist { font-size: 12px; color: #b3b3b3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 12px; }
.progress-bar { width: 100%; height: 4px; background: #404040; border-radius: 2px; overflow: hidden; margin-bottom: 6px; }
.progress-fill { height: 100%; background: #1DB954; border-radius: 2px; transition: width 0.1s linear; }
.time { font-size: 11px; color: #b3b3b3; }
.eq { position: absolute; top: 30px; right: 30px; display: flex; gap: 4px; align-items: flex-end; height: 20px; }
.eq-bar { width: 6px; border-radius: 2px; background: #1DB954; transition: height 0.2s; }
.eq-bar.paused { background: #535353; }
.placeholder { display: flex; align-items: center; justify-content: center; width: 100px; height: 100px; border-radius: 8px; background: #282828; flex-shrink: 0; }
.placeholder svg { width: 30px; height: 30px; fill: #535353; }
</style>
</head>
<body>
<div class="card" id="card">
  <div class="placeholder" id="art-container">
    <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
  </div>
  <div class="info">
    <div class="status" id="status">Not Playing</div>
    <div class="name" id="name">-</div>
    <div class="artist" id="artist">Spotify</div>
    <div class="progress-bar"><div class="progress-fill" id="progress"></div></div>
    <div class="time" id="time">0:00 / 0:00</div>
  </div>
  <div class="eq" id="eq"></div>
</div>
<script>
(function(){
  var state = { progressMs: 0, durationMs: 0, isPlaying: false, lastFetch: 0 };
  var eqBars = [0,0,0];
  var eqEl = document.getElementById('eq');

  function fmt(ms) {
    var s = Math.floor(ms/1000), m = Math.floor(s/60);
    return m + ':' + String(s%60).padStart(2,'0');
  }

  function renderEq() {
    eqEl.innerHTML = '';
    for(var i=0;i<3;i++){
      var bar = document.createElement('div');
      bar.className = 'eq-bar' + (state.isPlaying ? '' : ' paused');
      bar.style.height = (state.isPlaying ? eqBars[i] : [6,10,8][i]) + 'px';
      eqEl.appendChild(bar);
    }
  }

  function animateEq() {
    if(state.isPlaying) {
      eqBars[0] = 6 + Math.random()*14;
      eqBars[1] = 6 + Math.random()*14;
      eqBars[2] = 6 + Math.random()*14;
    }
    renderEq();
  }

  function update() {
    if(state.isPlaying && state.durationMs > 0) {
      var elapsed = Date.now() - state.lastFetch;
      var current = Math.min(state.progressMs + elapsed, state.durationMs);
      var pct = (current / state.durationMs) * 100;
      document.getElementById('progress').style.width = pct + '%';
      document.getElementById('time').textContent = fmt(current) + ' / ' + fmt(state.durationMs);
    }
  }

  function applyData(d) {
    state.lastFetch = Date.now();
    state.isPlaying = d.isPlaying;
    if(d.track) {
      state.progressMs = d.track.progressMs || 0;
      state.durationMs = d.track.durationMs || 0;
      document.getElementById('status').textContent = d.isPlaying ? 'Now Playing' : 'Last Played';
      document.getElementById('name').textContent = d.track.name;
      document.getElementById('artist').textContent = d.track.artist;
      var container = document.getElementById('art-container');
      if(d.track.albumArt) {
        container.innerHTML = '<img class="art" src="' + d.track.albumArt + '" alt=""/>';
      }
      var pct = state.durationMs > 0 ? (state.progressMs / state.durationMs)*100 : 0;
      document.getElementById('progress').style.width = pct + '%';
      document.getElementById('time').textContent = fmt(state.progressMs) + ' / ' + fmt(state.durationMs);
    } else {
      state.progressMs = 0;
      state.durationMs = 0;
      document.getElementById('status').textContent = 'Not Playing';
      document.getElementById('name').textContent = '-';
      document.getElementById('artist').textContent = 'Spotify';
      document.getElementById('progress').style.width = '0%';
      document.getElementById('time').textContent = '0:00 / 0:00';
    }
    renderEq();
  }

  function poll() {
    fetch('${dataUrl}').then(function(r){return r.json()}).then(function(j){
      if(j.success) applyData(j.data);
    }).catch(function(){});
  }

  poll();
  setInterval(poll, 5000);
  setInterval(update, 100);
  setInterval(animateEq, 300);
})();
</script>
</body>
</html>`
    }

    return { generateSvg, generateHtmlWidget, getNowPlayingData }
}

export type SpotifyWidgetService = ReturnType<typeof createSpotifyWidgetService>

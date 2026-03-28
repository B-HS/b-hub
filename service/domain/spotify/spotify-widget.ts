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

export type WidgetTheme = {
    radius: number
    bg: string
    color: string
    secondary: string
    accent: string
}

export const DEFAULT_THEME: WidgetTheme = {
    radius: 12,
    bg: '191414',
    color: 'ffffff',
    secondary: 'b3b3b3',
    accent: '1DB954',
}

type SpotifyWidgetServiceDeps = {
    spotifyDataService: SpotifyDataService
    albumArtCache: ReturnType<typeof createCache<string>>
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

const generateNotPlayingSvg = (t: WidgetTheme) => {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="140" viewBox="0 0 480 140">
  <style>
    .title { font: bold 14px 'Segoe UI', Ubuntu, sans-serif; fill: #${t.color}; }
    .subtitle { font: 12px 'Segoe UI', Ubuntu, sans-serif; fill: #${t.secondary}; }
  </style>
  <rect width="480" height="140" rx="${t.radius}" fill="#${t.bg}"/>
  <rect x="20" y="20" width="100" height="100" rx="8" fill="#282828"/>
  <g transform="translate(57, 57)">
    <circle cx="13" cy="13" r="13" stroke="#535353" stroke-width="2" fill="none"/>
    <path d="M11 8 L11 18 L19 13 Z" fill="#535353"/>
  </g>
  <text x="140" y="66" class="title">Not Playing</text>
  <text x="140" y="84" class="subtitle">Spotify</text>
</svg>`
}

export const createSpotifyWidgetService = (deps: SpotifyWidgetServiceDeps) => {
    const getNowPlayingData = async (spotifyAccountId: number): Promise<NowPlayingData> => {
        return deps.spotifyDataService.getNowPlaying(spotifyAccountId)
    }

    const generateSvg = async (spotifyAccountId: number, theme: WidgetTheme = DEFAULT_THEME): Promise<string> => {
        const data = await getNowPlayingData(spotifyAccountId)
        const t = theme

        if (!data.isPlaying || !data.track) return generateNotPlayingSvg(t)

        const { track } = data
        const trackName = escapeXml(truncateText(track.name, 30))
        const artistName = escapeXml(truncateText(track.artist, 35))
        const albumName = escapeXml(truncateText(track.album, 38))

        let albumArtTag = '<rect x="20" y="20" width="100" height="100" rx="8" fill="#282828"/>'
        if (track.albumArt) {
            const base64 = await fetchAlbumArtBase64(track.albumArt, deps.albumArtCache)
            if (base64) {
                albumArtTag = `<clipPath id="art-clip"><rect x="20" y="20" width="100" height="100" rx="8"/></clipPath>
    <image href="${base64}" x="20" y="20" width="100" height="100" clip-path="url(#art-clip)" preserveAspectRatio="xMidYMid slice"/>`
            }
        }

        const equalizerBars = `<g transform="translate(432, 48)">
      <style>
        @keyframes eq1 { 0%,100% { height: 8px; y: 12px; } 50% { height: 20px; y: 0; } }
        @keyframes eq2 { 0%,100% { height: 14px; y: 6px; } 50% { height: 8px; y: 12px; } }
        @keyframes eq3 { 0%,100% { height: 10px; y: 10px; } 50% { height: 18px; y: 2px; } }
        .bar1 { animation: eq1 0.8s ease-in-out infinite; }
        .bar2 { animation: eq2 0.6s ease-in-out infinite; }
        .bar3 { animation: eq3 0.7s ease-in-out infinite; }
      </style>
      <rect class="bar1" x="0" y="12" width="6" height="8" rx="2" fill="#${t.accent}"/>
      <rect class="bar2" x="10" y="6" width="6" height="14" rx="2" fill="#${t.accent}"/>
      <rect class="bar3" x="20" y="10" width="6" height="10" rx="2" fill="#${t.accent}"/>
    </g>`

        return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="140" viewBox="0 0 480 140">
  <style>
    .status { font: 11px 'Segoe UI', Ubuntu, sans-serif; fill: #${t.accent}; text-transform: uppercase; letter-spacing: 1px; }
    .title { font: bold 14px 'Segoe UI', Ubuntu, sans-serif; fill: #${t.color}; }
    .artist { font: 12px 'Segoe UI', Ubuntu, sans-serif; fill: #${t.secondary}; }
    .album { font: 11px 'Segoe UI', Ubuntu, sans-serif; fill: #686868; }
  </style>
  <rect width="480" height="140" rx="${t.radius}" fill="#${t.bg}"/>
  ${albumArtTag}
  ${equalizerBars}
  <text x="140" y="46" class="status">Now Playing</text>
  <text x="140" y="67" class="title">${trackName}</text>
  <text x="140" y="86" class="artist">${artistName}</text>
  <text x="140" y="106" class="album">${albumName}</text>
</svg>`
    }

    const generateHtmlWidget = (token: string, baseUrl: string, theme: WidgetTheme = DEFAULT_THEME): string => {
        const dataUrl = `${baseUrl}/api/spotify/playing/${token}/data`
        const t = theme

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=480"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:480px;height:140px;overflow:hidden;font-family:'Segoe UI',Ubuntu,sans-serif;background:transparent}
.card{width:480px;height:140px;background:#${t.bg};border-radius:${t.radius}px;position:relative;display:flex;align-items:center;padding:20px;gap:20px}
.art{width:100px;height:100px;border-radius:8px;background:#282828;flex-shrink:0;object-fit:cover}
.info{flex:1;min-width:0}
.status{font-size:11px;color:#${t.accent};text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.name{font-size:14px;font-weight:bold;color:#${t.color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px}
.artist{font-size:12px;color:#${t.secondary};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:12px}
.bar{width:100%;height:4px;background:#404040;border-radius:2px;overflow:hidden;margin-bottom:6px}
.fill{height:100%;background:#${t.accent};border-radius:2px;will-change:width}
.time{font-size:11px;color:#${t.secondary}}
.eq{position:absolute;top:30px;right:30px;display:flex;gap:4px;align-items:flex-end;height:20px}
.eq b{display:block;width:6px;border-radius:2px;will-change:height}
.eq b.on{background:#${t.accent}}
.eq b.off{background:#535353}
.ph{display:flex;align-items:center;justify-content:center;width:100px;height:100px;border-radius:8px;background:#282828;flex-shrink:0}
.ph svg{width:30px;height:30px;fill:#535353}
@keyframes e1{0%,100%{height:8px}50%{height:20px}}
@keyframes e2{0%,100%{height:14px}50%{height:8px}}
@keyframes e3{0%,100%{height:10px}50%{height:18px}}
.eq b.a1{animation:e1 .8s ease-in-out infinite}
.eq b.a2{animation:e2 .6s ease-in-out infinite}
.eq b.a3{animation:e3 .7s ease-in-out infinite}
</style>
</head>
<body>
<div class="card">
  <div class="ph" id="ac"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
  <div class="info">
    <div class="status" id="st">Not Playing</div>
    <div class="name" id="nm">-</div>
    <div class="artist" id="ar">Spotify</div>
    <div class="bar"><div class="fill" id="pg"></div></div>
    <div class="time" id="tm">0:00 / 0:00</div>
  </div>
  <div class="eq" id="eq"><b class="off" id="b0"></b><b class="off" id="b1"></b><b class="off" id="b2"></b></div>
</div>
<script>
(function(){
  var S={p:0,d:0,on:false,t:0},
      $=function(i){return document.getElementById(i)},
      pg=$('pg'),tm=$('tm'),st=$('st'),nm=$('nm'),ar=$('ar'),ac=$('ac'),
      b0=$('b0'),b1=$('b1'),b2=$('b2');

  function f(ms){var s=Math.floor(ms/1000),m=Math.floor(s/60);return m+':'+String(s%60).padStart(2,'0')}

  function eq(on){
    var c=on?'on':'off',a1=on?' a1':'',a2=on?' a2':'',a3=on?' a3':'';
    b0.className=c+a1;b1.className=c+a2;b2.className=c+a3;
    if(!on){b0.style.height='6px';b1.style.height='10px';b2.style.height='8px'}
    else{b0.style.height='';b1.style.height='';b2.style.height=''}
  }

  function tick(){
    if(S.on&&S.d>0){
      var c=Math.min(S.p+Date.now()-S.t,S.d);
      pg.style.width=(c/S.d*100)+'%';
      tm.textContent=f(c)+' / '+f(S.d);
    }
  }

  function reset(){
    S.p=0;S.d=0;S.on=false;st.textContent='Not Playing';nm.textContent='-';ar.textContent='Spotify';
    pg.style.width='0%';tm.textContent='0:00 / 0:00';
    ac.innerHTML='<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    eq(false);
  }

  function apply(d){
    S.t=Date.now();S.on=d.isPlaying;
    if(d.isPlaying&&d.track){
      S.p=d.track.progressMs||0;S.d=d.track.durationMs||0;
      st.textContent='Now Playing';
      nm.textContent=d.track.name;ar.textContent=d.track.artist;
      var cur=ac.querySelector('img');
      if(d.track.albumArt){
        if(!cur||cur.src!==d.track.albumArt){
          var img=document.createElement('img');img.className='art';img.src=d.track.albumArt;
          ac.textContent='';ac.appendChild(img);
        }
      }else if(cur){ac.innerHTML='<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'}
      pg.style.width=(S.d>0?S.p/S.d*100:0)+'%';
      tm.textContent=f(S.p)+' / '+f(S.d);
      eq(true);
    }else{
      reset();
    }
  }

  var url=${JSON.stringify(dataUrl)};
  function poll(){fetch(url).then(function(r){return r.json()}).then(function(j){if(j.success)apply(j.data)}).catch(function(){})}

  poll();
  setInterval(poll,5000);
  setInterval(tick,200);
})();
</script>
</body>
</html>`
    }

    return { generateSvg, generateHtmlWidget, getNowPlayingData }
}

export type SpotifyWidgetService = ReturnType<typeof createSpotifyWidgetService>

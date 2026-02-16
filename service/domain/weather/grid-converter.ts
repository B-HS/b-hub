const RE = 6371.00877
const GRID = 5.0
const SLAT1 = 30.0
const SLAT2 = 60.0
const OLON = 126.0
const OLAT = 38.0
const XO = 43
const YO = 136

const DEGRAD = Math.PI / 180.0
const RADDEG = 180.0 / Math.PI

const sn = Math.tan(Math.PI * 0.25 + SLAT2 * 0.5 * DEGRAD) / Math.tan(Math.PI * 0.25 + SLAT1 * 0.5 * DEGRAD)
const snLog = Math.log(Math.cos(SLAT1 * DEGRAD) / Math.cos(SLAT2 * DEGRAD)) / Math.log(sn)
const sf = Math.tan(Math.PI * 0.25 + SLAT1 * 0.5 * DEGRAD)
const sfPow = (Math.pow(sf, snLog) * Math.cos(SLAT1 * DEGRAD)) / snLog
const ro = Math.tan(Math.PI * 0.25 + OLAT * 0.5 * DEGRAD)
const roPow = ((RE / GRID) * sfPow) / Math.pow(ro, snLog)

export const latLonToGrid = (lat: number, lon: number) => {
    const ra = Math.tan(Math.PI * 0.25 + lat * 0.5 * DEGRAD)
    const raPow = ((RE / GRID) * sfPow) / Math.pow(ra, snLog)
    let theta = lon * DEGRAD - OLON * DEGRAD
    if (theta > Math.PI) theta -= 2.0 * Math.PI
    if (theta < -Math.PI) theta += 2.0 * Math.PI
    theta *= snLog

    const x = Math.floor(raPow * Math.sin(theta) + XO + 0.5)
    const y = Math.floor(roPow - raPow * Math.cos(theta) + YO + 0.5)

    return { x, y }
}

export const gridToLatLon = (x: number, y: number) => {
    const xn = x - XO
    const yn = roPow - y + YO
    const ra = Math.sqrt(xn * xn + yn * yn)
    const raPow = Math.pow(((RE / GRID) * sfPow) / ra, 1.0 / snLog)

    let theta = 0
    if (Math.abs(xn) <= 0.0) {
        theta = 0.0
    } else {
        if (Math.abs(yn) <= 0.0) {
            theta = Math.PI * 0.5
            if (xn < 0.0) theta = -theta
        } else {
            theta = Math.atan2(xn, yn)
        }
    }

    const lat = (2.0 * Math.atan(raPow) - Math.PI * 0.5) * RADDEG
    const lon = (theta / snLog + OLON * DEGRAD) * RADDEG

    return { lat, lon }
}

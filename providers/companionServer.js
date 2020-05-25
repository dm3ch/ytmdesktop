const { ipcMain } = require('electron')
const http = require('http')
const os = require('os')
const networkInterfaces = os.networkInterfaces()
const qrcode = require('qrcode-generator')
const infoPlayer = require('../utils/injectGetInfoPlayer')
const settingsProvider = require('../providers/settingsProvider')

const ip = '0.0.0.0'
const port = 9863

const pattIgnoreInterface = /(virtual|wsl|vEthernet|Default Switch)\w*/gim

let totalConnections = 0
let timerTotalConections

var serverFunction = function(req, res) {
    if (req.url === '/') {
        var collection = ''

        Object.keys(networkInterfaces).forEach((v, k) => {
            if (!pattIgnoreInterface.test(v)) {
                networkInterfaces[v].forEach((vv, kk) => {
                    if (vv.family == 'IPv4' && vv.internal == false) {
                        var qr = qrcode(0, 'M')
                        qr.addData(
                            `{ "name": "${os.hostname()}", "ip":"${
                                vv.address
                            }" }`
                        )
                        qr.make()

                        collection += `
                          <div class="row" style="margin-top: 10px;">
                              <div class="col s12">
                                  <div class="card transparent z-depth-0">
                                      <div class="card-content">
                                          <div class="row" style="margin-bottom: 0 !important;">
                                              <div class="col s6"> 
                                                  <img class="card card-content" style="padding: 10px !important;" src="${qr.createDataURL(
                                                      6
                                                  )}" width="180" />
                                              </div>
                                              <div class="col s6 white-text" style="border-left: solid 1px #222 !important; heigth: 500px; margin-top: 2.8% !important;"> 
                                                  <h3>${v}</h3> 
                                                  <h5 style="font-weight: 100 !important;">${
                                                      vv.address
                                                  }</h5> 
                                              </div>
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      `
                    }
                })
            }
        })

        res.setHeader('Content-Type', 'text/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.writeHead(200)

        res.write(`<html>
          <head>
              <title>YouTube Music Desktop Companion</title>
              <meta http-equiv="refresh" content="60">
              <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
              <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
              <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/css/materialize.min.css">
              <style>
                  html, body {
                      margin: 0;
                      padding: 0;
                      text-align: center;
                      background: linear-gradient(to right top, #000 20%, #1d1d1d 80%);
                  }
                  h5 {
                      margin: 1rem 0 1rem 0 !important;
                  }
              </style>
          </head>
          <body>              
              <h3 class="red-text">YouTube Music Desktop</h3>
              
              <div class="row" style="height: 0; visibility: ${
                  infoPlayer.getTrackInfo().id ? 'visible' : 'hidden'
              }">
                <div class="col s8 offset-s2 m6 offset-m3 l2 offset-l5">
                    <div class="card horizontal">
                      <div class="card-image" style="padding: 3px;">
                        <img src="${
                            infoPlayer.getTrackInfo().cover
                        }" style="min-width: 78px; width: 78px;">
                      </div>
                      <div class="card-stacked" style="width: 74%;">
                        <div class="card-content" style="font-size: 11px;">
                          <p class="truncate"><strong>${
                              infoPlayer.getTrackInfo().title
                          }</strong></p>
                          ${infoPlayer.getTrackInfo().author}
                        </div>
                      </div>
                    </div>
                </div>
              </div>
  
              <div class="container" style="margin-top: 13%;">
  
                  ${collection}
  
              </div>
  
              <div class="card-panel transparent z-depth-0 white-text" style="position: fixed; bottom: 0; text-align: center; width: 100%;">
                  ${os.hostname()} <a class="white-text btn-flat tooltipped" data-position="top" data-tooltip="Devices Connected"><i class="material-icons left">devices</i>${totalConnections}</a>
              </div>
  
          </body>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/js/materialize.min.js"></script>
          <script>
              document.addEventListener('DOMContentLoaded', function() {
                  var elems = document.querySelectorAll('.tooltipped');
                  M.Tooltip.init(elems, {});
              });
          </script>
      </html>`)

        res.end()
    }

    if (req.url === '/query') {
        res.setHeader('Content-Type', 'text/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')

        if (req.method === 'GET') {
            res.write(JSON.stringify(infoPlayer.getAllInfo()))
            res.end()
        }

        if (req.method === 'POST') {
            try {
                let headerAuth = req.headers.authorization
                let auth = headerAuth.split(' ')[1]

                if (
                    auth ==
                    settingsProvider.get('settings-companion-server-token')
                ) {
                    let body = []

                    req.on('data', chunk => {
                        body.push(chunk)
                    }).on('end', () => {
                        try {
                            body = Buffer.concat(body).toString()
                            let cmd = JSON.parse(body)
                            execCmd(cmd.command, cmd.value)
                            res.end(body)
                        } catch {
                            res.end(
                                JSON.stringify({
                                    error: 'error to execute command',
                                })
                            )
                        }
                    })
                } else {
                    res.writeHead(401)
                    res.end(JSON.stringify({ error: 'Unathorized' }))
                }
            } catch {
                res.writeHead(400)
                res.end(JSON.stringify({ error: 'No token provided' }))
            }
        }
    }
}

var server = http.createServer(serverFunction)

function start() {
    server.listen(port, ip)
    const io = require('socket.io')(server)

    timerTotalConections = setInterval(() => {
        totalConnections = Object.keys(io.sockets.sockets).length

        if (totalConnections) {
            io.emit('query', infoPlayer.getAllInfo())
        }
    }, 800)

    io.on('connection', socket => {
        socket.on('media-commands', (cmd, value) => {
            execCmd(cmd, value)
        })
    })

    console.log('Companion Server listening on port ' + port)
}

function stop() {
    clearInterval(timerTotalConections)
    server.close()
    console.log('Companion Server has stopped')
}

function execCmd(cmd, value) {
    value = value || true

    switch (cmd) {
        case 'track-previous':
            ipcMain.emit('media-previous-track', true)
            break

        case 'track-play':
            ipcMain.emit('media-play-pause', true)
            break

        case 'track-pause':
            ipcMain.emit('media-play-pause', true)
            break

        case 'track-next':
            ipcMain.emit('media-next-track', true)
            break

        case 'track-thumbs-up':
            ipcMain.emit('media-up-vote', true)
            break

        case 'track-thumbs-down':
            ipcMain.emit('media-down-vote', true)
            break

        case 'player-volume-up':
            ipcMain.emit('media-volume-up', true)
            break

        case 'player-volume-down':
            ipcMain.emit('media-volume-down', true)
            break

        case 'player-forward':
            ipcMain.emit('media-forward-X-seconds', true)
            break

        case 'player-rewind':
            ipcMain.emit('media-rewind-X-seconds', true)
            break

        case 'player-set-seekbar':
            ipcMain.emit('media-change-seekbar', value)
            break
    }
}

module.exports = {
    start: start,
    stop: stop,
}

// bci2000web.js
//* A node-based implementation of web-socket based BCI2000 remote control

"use strict";
import path from "path";
import express from "express";
const app = express();
import expressWs from "express-ws";
import Telnet from "telnet-client";
import opn from "opn";
import dgram from "dgram";
import routes from "./routes.js";
import helpers from "./helpers.js";
import http from "http";
import https from "https";
import fs from "fs";
app.use(express.json())

let __dirname = path.resolve(path.dirname(""));
const config = JSON.parse(
  fs.readFileSync("./server/Config/config.json", "utf8")
);
let operatorPath;
const args = process.argv;
if (args[2] == "-prog") {
  operatorPath = `${path.resolve(config.bci2kdir)}/${args[3]}/Operator.exe`;
} else {
  operatorPath = `${path.resolve(config.bci2kdir)}/prog/Operator.exe`;
}
console.log(`Using: ${operatorPath}`);

import merge from "webpack-merge";
import webpack from "webpack";
import webpackConfig from "../webpack.config.js";
import webpackDevMiddleware from "webpack-dev-middleware";

let newConfig = merge(webpackConfig, {
  plugins: [
    new webpack.optimize.OccurrenceOrderPlugin(),
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NoEmitOnErrorsPlugin()
  ]
});
if (fs.existsSync("./server/credentials/")) {
  let httpsServer = https.createServer(
    {
      key: fs.readFileSync("./server/credentials/server.key"),
      cert: fs.readFileSync("./server/credentials/server.crt")
    },
    app
  );
  expressWs(app, httpsServer);
  httpsServer.listen(443);
}
const httpServer = http.createServer(app);
expressWs(app, httpServer);

const compiler = webpack(newConfig);
app.use(webpackDevMiddleware(compiler));
app.use("/", routes(express));

//? Connect to BCI2000's operator telnet port in order to send/receive operator commands.
const connectTelnet = async operator => {
  const connection = new Telnet();

  // Cache new parameters in the operator process object
  operator.telnet = null;
  operator.commandQueue = [];
  operator.executing = null;

  connection.on("ready", () => (operator.telnet = connection));
  connection.on("timeout", () => (operator.executing = null));
  connection.on("close", () => process.exit(0));

  try {
    //TODO configure this better
    await connection.connect({
      host: "127.0.0.1",
      port: config.telnetPort,
      timeout: 1000,
      shellPrompt: ">",
      echoLines: 0,
      execTimeout: 30
    });
  } catch (error) {
    console.log(error);
  }

  //!Fixes an idiotic race condition where the WS isn't set up until AFTER bci2000 connects
  //!arbitrary time, in the future set this into the config.json
  await new Promise(resolve => setTimeout(resolve, 2000));
  //? Set up WebSocket handler
  app.ws("/", ws => {
    ws.on("message", message => {
      let msg = JSON.parse(message);
      msg.ws = ws;
      if (msg.opcode == "E") {
        operator.commandQueue.push(msg);
      }
    });
  });

  // Start command execution loop
  //?Every 20ms send info about connection state/listen for commands
  (function syncCommunications() {
    if (
      operator.commandQueue.length &&
      operator.telnet &&
      !operator.executing
    ) {
      operator.executing = operator.commandQueue.shift();

      operator.telnet.exec(operator.executing.contents, (err, response) => {
        let ws = operator.executing.ws;
        let id = operator.executing.id;
        operator.executing = null;
        if (response != undefined) {
          try {
            let msg = {
              opcode: "O",
              id: id,
              contents: response.trim()
            };
            ws.send(JSON.stringify(msg));
          } catch (e) {
            /* client stopped caring */
          }
        }
      });
    }
    setTimeout(syncCommunications, 20);
  })();
};
//?Check if BCI2000 is running
helpers.isRunning("operator.exe", "myprocess", "myprocess").then(v => {
  //? if not, start BCI2000 operator.exe
  if (!v) {
    helpers
      .launchOperator(operatorPath, config.telnetPort, config.hide)
      //?Add a timeout...
      .then(
        x =>
          new Promise(resolve =>
            setTimeout(() => resolve(x), config.telnetTimeout)
          )
      )
      //? ...so we can connect to the telnet port without throwing an erro.
      .then(operator => {
        connectTelnet(operator, config.telnetPort);
      })
      //?More timeouts
      //TODO make more elegant.
      .then(x => {
        new Promise(resolve =>
          setTimeout(() => {
            resolve(x);
            //? Automatically open a browser to go to BCI2000Web
            if (config.autoOpen) {
              opn("http://127.0.0.1");
            }
          }, 1500)
        );
      })
      .catch(reason => console.log(reason));
  }
});
httpServer.listen(8080, () => console.log("Trying my best"));
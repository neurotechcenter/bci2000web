//* bci2000web.js
//? A node-based implementation of web-socket based BCI2000 remote control
//! test
//TODO asdf
////no
"use strict";
const path = require("path");
const fs = require("fs");
const express = require("express");
const app = express();
const expressWs = require("express-ws")(app);
const Telnet = require("telnet-client");
const config = require("./Config/config.json");
const opn = require("opn");
const routes = require("./routes")(express);
const helpers = require("./helpers.js");

const operatorPath = `${path.resolve(config.bci2kdir)}/prog/Operator.exe`;
const merge = require("webpack-merge");
const webpack = require("webpack");
const webpackConfig = require("../webpack.config.js");
let newConfig = merge(webpackConfig, {
  plugins: [
    new webpack.optimize.OccurrenceOrderPlugin(),
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NoEmitOnErrorsPlugin()
  ]
});

app.use("/", routes);

if (process.env.NODE_ENV == "production") {
  app.use("/", express.static("./dist"));
} else if (process.env.NODE_ENV == "development") {
  const compiler = webpack(newConfig);
  app.use(require("webpack-dev-middleware")(compiler, { noInfo: true }));
  app.use(require("webpack-hot-middleware")(compiler));
} else {
  app.use("/", express.static("./dist"));
}

const connectTelnet = async operator => {
  const connection = new Telnet();

  // Cache new parameters in the operator process object
  operator.telnet = null;
  operator.commandQueue = [];
  operator.executing = null;

  connection.on("ready", () => (operator.telnet = connection));
  connection.on("timeout", () => (operator.executing = null));
  connection.on("close", () => process.exit(0));

  await connection.connect({
    host: "127.0.0.1",
    port: config.telnetPort,
    timeout: 1000,
    shellPrompt: ">",
    echoLines: 0,
    execTimeout: 30
  });

  //Fixes an idiotic race condition where the WS isn't set up until AFTER bci2000 connects
  //arbitrary time, in the future set this into the config.json
  await new Promise(resolve => setTimeout(resolve, 2000));
  // Set up WebSocket handler
  app.ws("/", ws => {
    ws.on("message", msg => {
      let preamble = msg.split(" ");
      var msg = {};
      msg.opcode = preamble.shift();
      msg.id = preamble.shift();
      msg.contents = preamble.join(" ");
      msg.ws = ws;
      if (msg.opcode == "E") {
        operator.commandQueue.push(msg);
      }
    });
  });

  // Start command execution loop
  (function syncCommunications() {
    if (
      operator.commandQueue.length &&
      operator.telnet &&
      !operator.executing
    ) {
      operator.executing = operator.commandQueue.shift();
      try {
        operator.executing.ws.send(
          ["S", operator.executing.id].join(" ").trim()
        );
      } catch (e) {
        /* client stopped caring */
      }

      operator.telnet.exec(operator.executing.contents, (err, response) => {
        let ws = operator.executing.ws;
        let id = operator.executing.id;
        operator.executing = null;
        try {
          ws.send(["O", id, response].join(" ").trim());
          ws.send(["D", id].join(" ").trim());
        } catch (e) {
          /* client stopped caring */
        }
      });
    }
    setTimeout(syncCommunications, 20);
  })();
};

helpers.isRunning("operator.exe", "myprocess", "myprocess").then(v => {
  if (!v) {
    helpers
      .launchOperator(operatorPath, config.telnetPort, config.hide)
      .then(
        x =>
          new Promise(resolve =>
            setTimeout(() => resolve(x), config.telnetTimeout)
          )
      )
      .then(operator => {
        connectTelnet(operator, config.telnetPort);
      })
      .then(
        x => {
          new Promise(resolve => 
            setTimeout(() => resolve(x), 10000)
      )
      if (config.autoOpen) opn("http://127.0.0.1");
          })
      .catch(reason => console.log(reason));

  }
});

app.listen(config.webPort, () => {});

const WebSocket = require("ws");
class Socket {
  constructor(server) {
    const master = this;
    this.socket = new WebSocket.Server({ server });
    this.socketClient = class {
      constructor(_socket) {
        this.socket = _socket;
        this.id = generateId(10);
        this.callbacks = {};
        this.eventListeners = {
          error: [{ callback: e => console.log("error", e), once: false }],
          close: [{ callback: e => console.log("closed socket", e), once: false }],
          disconnect: [{ callback: e => console.log("disconnect socket", e), once: false }],
          open: [{ callback: event => console.log("ws opened"), once: false }],
          imConnected: [{ callback: (e) => this.emit("connect"), once: true }]
        };
        this.socket.on("open", (event) => {
          this.callListener("open", event)
          this.emit("connect");
        })
        this.socket.on("close", closeArg => {
          this.callListener("close", closeArg)
          this.callListener("disconnect", closeArg);
        })
        function generateId(len){
          const charset = "abdefghijklmnopqrstuvwxyzABDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
          const hash = n => [...new Array(n)].map(x=>charset[Math.floor(Math.random()*charset.length)]).join("")
          return hash(len);
        }
        function checkCallbacks({ event, args }) {
          for (let key of Object.keys(this.callbacks)) {
            const string = `__${key}:callback_`
            if (!event.indexOf(string)) {
              const index = event[string.length];
              this.callbacks[key][index](...args);
              this.callbacks[key].splice(index, 1);
              return true;
            }
          }
          return false;
        }
        this.socket.on("message", (_event) => {
          let parsedEvent = {};
          try {
            parsedEvent = JSON.parse(_event);
            const { event } = parsedEvent;
            if (!parsedEvent || !parsedEvent.hasOwnProperty("event")) return this.callListener("error", "Invalid JSON content")
            if (checkCallbacks.call(this, parsedEvent)) return;

            let eventCallbacks = this.eventListeners[event];
            if (!eventCallbacks) {
              return;
            }
            let args = parsedEvent.args;
            let functions = args.map((x, y) => [x, y]).filter(x => typeof x[0] === "string" && ~x[0].indexOf("__function(){}__"));
            functions.forEach((data, callbackIndex) => {
              let [arg, i] = data;
              args[i] = ((...callbackArgs) => {
                this.emit(`__${event}:callback_${callbackIndex}`, ...callbackArgs);
              }).bind(this);
            })
            this.callListener(event, ...args);
          } catch (e) {
            return this.callListener("error", e);
          }
        })
      }
      callListener(listener, ...args) {
        if (!this.eventListeners.hasOwnProperty(listener)) return this;
        const eventCallbacks = this.eventListeners[listener];
        eventCallbacks.forEach((eventCallback, eventCallbackIndex) => {
          eventCallback.callback(...args);
          if (eventCallbacks.once) {
            this.eventListeners[event].splice(eventCallbackIndex, 1);
          }
        });
        return this;
      }
      removeAllListeners(listener){
        if (!listener || !listener.length) listener = Object.keys(this.eventListeners);
        else listener = [listener];
        listener.forEach(x=>{
          if (this.eventListeners.hasOwnProperty(x)) this.eventListeners[x].length = 0;
        })
        return this;
      }
      join(roomName) {
        master.rooms[roomName] = master.rooms[roomName] || [];
        master.rooms[roomName].push(this);
        return this;
      }
      leave(roomName) {
        if (master.rooms[roomName]) delete master.rooms[roomName];
        return this;
      }
      disconnect() {
        this.socket.close();
      }
      emit(event, ...spreadArgs) {
        if (this.socket.readyState !== 1) return ;
        this.socket.send(JSON.stringify({
          event,
          args: [...spreadArgs]
        }, (a, elem) => {
          if (typeof elem == "function") {
            this.callbacks[event] = this.callbacks[event] || [];
            this.callbacks[event].push(elem);
            return "__function(){}__";
          } else return elem
        }))
        return this;
      }
      once(eventName, callback) {
        return this.on(eventName, callback, true);
      }
      on(eventName, callback, once = false) {
        if (typeof callback !== "function" || !eventName) return this.socket;
        this.eventListeners[eventName] = this.eventListeners[eventName] || [];
        this.eventListeners[eventName].push({
          callback, once
        })
        return this;
      }
      off(eventName, callback){
        if (!eventName) return this.socket;
        if (!callback || typeof callback !== "function") return this.removeAllListeners(eventName);
        if (this.eventListeners.hasOwnProperty(eventName)){
          this.eventListeners[eventName].forEach((event, index) => {
            if (event.callback == callback) this.eventListeners[eventName].splice(index, 1);
          })
        }
        return this;
      }
    }
    this.rooms = {};
    this.eventListeners = {
      connect: [{function: () => { }, once: false}] 
    }
    this.socket.on("connection", (arg) => {
      this.callListener("connect", new this.socketClient(arg))
    });
  }
  callListener(listener, ...args) {
    if (!this.eventListeners.hasOwnProperty(listener)) return this;
    const eventCallbacks = this.eventListeners[listener];
    eventCallbacks.forEach((eventCallback, eventCallbackIndex) => {
      eventCallback.function(...args);
      if (eventCallbacks.once) {
        this.eventListeners[event].splice(eventCallbackIndex, 1);
      }
    });
    return this;
  }
  once(eventName, callback) {
    this.on(eventName, callback, true);
  }
  removeAllListeners(listener){
    if (!listener || !listener.length) listener = Object.keys(this.eventListeners);
    else listener = [listener];
    listener.forEach(x=>{
      if (this.eventListeners.hasOwnProperty(x)) this.eventListeners[x].length = 0;
    })
    return this;
  }
  off(eventName, callback){
    if (!eventName) return this.socket;
    if (!callback || typeof callback !== "function") return this.removeAllListeners(eventName);
    if (this.eventListeners.hasOwnProperty(eventName)){
      this.eventListeners.forEach((event, index) => {
        if (event.function == callback) this.eventListeners[event].splice(index, 1);
      })
    }
  }
  on(eventName, callback, once = false) {
    if (typeof callback === "function" && eventName)
    this.eventListeners[eventName] = this.eventListeners[eventName] || [];
    this.eventListeners[eventName].push({
      function: (...args) => {
        callback(...args)
      },
      once
    })
    return this;
  }
  broadcast(roomName, emitter, ...args) {
    if (!this.rooms.hasOwnProperty(roomName)) return "error";
    let room = this.rooms[roomName];
    for (let i = 0, s; s = room[i]; i++) {
      s.emit(emitter, ...args);
    }
    return this;
  }
}


class SocketClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.callbacks = {};
    this.id = generateId(10);
    this.eventListeners = {
      error: [{ callback: e => console.log("error", e), once: false }],
      disconnect: [{ callback: e => console.log("disconnect socket", e), once: false }],
      open: [{ callback: e => this.emit("imConnected"), once: true }],
    };
    function generateId(len){
      const charset = "abdefghijklmnopqrstuvwxyzABDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const hash = n => [...new Array(n)].map(x=>charset[Math.floor(Math.random()*charset.length)]).join("")
      return hash(len);
    }
    function checkCallbacks({ event, args }) {
      for (let key of Object.keys(this.callbacks)) {
        const string = `__${key}:callback_`
        if (!event.indexOf(string)) {
          const index = event[string.length];
          this.callbacks[key][index](...args);
          delete this.callbacks[key][index];
          return true;
        }
      }
      return false;
    }
    this.socket.onopen = (event) => {
      this.callListener("open", event)
    }
    this.socket.onclose = closeArg => {
      this.callListener("disconnect", closeArg);
    }
    this.socket.onmessage = ({ data }) => {
      let parsedEvent = {};
      try {
        // @ts-ignore
        parsedEvent = JSON.parse(data);
      } catch (e) {
        return this.callListener("error", e);
      } finally {
        const { event } = parsedEvent;
        if (!parsedEvent || !parsedEvent.hasOwnProperty("event")) return this.callListener("error", "Invalid JSON content")
        if (checkCallbacks.call(this, parsedEvent)) return;
        let eventCallback = this.eventListeners[event];
        if (!eventCallback) {
          return;
        }
        let args = parsedEvent.args;
        let functions = args.map((x, y) => [x, y]).filter(x => typeof x[0] === "string" && ~x[0].indexOf("__function(){}__"));
        functions.forEach((data, callbackIndex) => {
          let [arg, i] = data;
          args[i] = ((...callbackArgs) => {
            this.emit(`__${event}:callback_${callbackIndex}`, ...callbackArgs);
          }).bind(this);
        })
        this.callListener(event, ...parsedEvent.args);
      }
    }

  }
  callListener(listener, ...args) {
    if (!this.eventListeners.hasOwnProperty(listener)) return this.socket;
    const eventCallbacks = this.eventListeners[listener];
    eventCallbacks.forEach((eventCallback, eventCallbackIndex) => {
      eventCallback.callback(...args);
      if (eventCallbacks.once) {
        this.eventListeners[event].splice(eventCallbackIndex, 1);
      }
    });
    return this;
  }
  disconnect() {
    this.socket.close();
  }
  removeAllListeners(listener){
    if (!listener || !listener.length) listener = Object.keys(this.callbacks);
    else listener = [listener];
    listener.forEach(x=>{
      if (this.callbacks.hasOwnProperty(x)) this.callbacks[x].length = 0;
    })
    return this;
  }
  once(eventName, callback) {
    return this.on(eventName, callback, true);
  }
  on(eventName, callback, once = false) {
    if (typeof callback !== "function" || !eventName) return this.socket;
    this.eventListeners[eventName] = this.eventListeners[eventName] || [];
    this.eventListeners[eventName].push({
      callback, once
    })
    return this;
  }
  off(eventName, callback) {
    if (!eventName) return this.socket;
    if (!callback || typeof callback !== "function") return this.removeAllListeners(eventName);
    if (this.eventListeners.hasOwnProperty(eventName)) {
      this.eventListeners[eventName].forEach((event, index) => {
        if (event.callback == callback) this.eventListeners[eventName].splice(index, 1);
      })
    }
    return this;
  }
  emit(event, ...spreadArgs) {
    let callbackIndex = 0;
    this.socket.send(JSON.stringify({
      event,
      args: [...spreadArgs]
    }, (a, elem) => {
      if (typeof elem == "function") {
        this.callbacks[event] = this.callbacks[event] || [];
        this.callbacks[event].push(elem);
        return "__function(){}__";
      } else return elem
    }))
    return this;
  }
}

module.exports = { Socket, SocketClient }
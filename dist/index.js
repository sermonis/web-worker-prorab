"use strict";
exports.__esModule = true;
function log() {
    var msg = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        msg[_i] = arguments[_i];
    }
    console.log.apply(console, ['[main thread][' + Date.now() + '] '].concat(msg));
}
function workerInit() {
    var _this = this;
    this.msgHandlers = {};
    this.options = {};
    this.imports = {};
    this.debug = false;
    this.log = function () {
        var msg = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            msg[_i] = arguments[_i];
        }
        console.log.apply(console, ['[worker][' + Date.now() + '] '].concat(msg));
    };
    this.registerMsgHandler = function (handlerName, handler) {
        if (!_this.msgHandlers[handlerName]) {
            _this.msgHandlers[handlerName] = handler;
        }
    };
    this.dropMsgHandler = function (handlerName) {
        delete _this.msgHandlers[handlerName];
    };
    this.send = function (message) {
        if (_this.debug) {
            _this.log('Sending message: ' + message.type);
        }
        _this.postMessage(JSON.stringify(message));
    };
    self.onmessage = function (event) {
        switch (event.data.type) {
            case 'init':
                for (var i in event.data.options) {
                    var elem = event.data.options[i];
                    if (elem && elem.substr && elem.substr(0, 4) == 'blob') {
                        importScripts(elem);
                    }
                    else {
                        _this.options[i] = elem;
                    }
                }
                break;
            default:
                var payload = event.data.payload && JSON.parse(event.data.payload) || {};
                if (event.data.debug) {
                    _this.log('Received message: ' + event.data.type, payload);
                    _this.debug = true;
                }
                else {
                    _this.debug = false;
                }
                if (_this.msgHandlers[event.data.type]) {
                    _this.msgHandlers[event.data.type](payload);
                }
        }
    };
}
function getMainFunc(func, umdImports) {
    return URL.createObjectURL(new Blob([
        '(', workerInit.toString(), ')();',
        '(', func.toString(), ')();'
    ].concat(umdImports), {
        type: 'application/javascript'
    }));
}
// Replace calls to functions in current context to allow multiple functions to be passed inside.
function replaceContext(funcStr, context) {
    return context.reduce(function (acc, val) {
        return acc.replace(new RegExp(val + '\\s*\\(', 'g'), 'options.' + val + '(')
            .replace('function options.', 'function '); // declarations should not be replaced
    }, funcStr);
}
function prepareOptions(options) {
    var prepared = {};
    for (var i in options) {
        if (typeof options[i] == 'function') {
            prepared[i] = URL.createObjectURL(new Blob(['options["' + i + '"] = ', replaceContext(options[i].toString(), Object.keys(options))], { type: 'application/javascript' }));
        }
        else {
            prepared[i] = options[i];
        }
    }
    return prepared;
}
function makeWebpackImports(imports) {
    if (typeof __webpack_modules__ === 'undefined') {
        return [];
    }
    var procImports = [
        'var mod; var imported = {}; '
            + 'var resolver = function (moduleId) { if (!imports[imported[moduleId]]) { '
            + 'throw new Error("Import " + moduleId + " (mapped to " + imported[moduleId] + ") cannot be found. You may try to '
            + 'reorder your imports, to load all dependencies before any dependent imports '
            + 'to fix this."); } return imports[imported[moduleId]]; };'
            + 'resolver.d = function(target, member, value) { setTimeout(function() { target[member] = value(); }, 0); };'
    ];
    for (var i in imports) {
        procImports.push('var mod = {exports: {}}; (' + __webpack_modules__[imports[i]]
            + ')(mod, mod.exports, resolver); '
            + 'imports["' + i + '"] = mod.exports; '
            + 'imported[' + imports[i] + '] = "' + i + '";');
    }
    return procImports;
}
exports.createWorker = function (mainFunc, options, webpackImports, debug) {
    if (debug === void 0) { debug = false; }
    var worker = new Worker(getMainFunc(mainFunc, makeWebpackImports(webpackImports || {})));
    worker.postMessage({
        type: 'init',
        debug: false,
        options: prepareOptions(options)
    });
    var controlObject = {
        worker: worker,
        messageListeners: {},
        debug: debug,
        registerMsgHandler: function (eventType, handler) {
            if (!controlObject.messageListeners[eventType]) {
                controlObject.messageListeners[eventType] = handler;
            }
            return controlObject;
        },
        dropMsgHandler: function (eventType) {
            delete controlObject.messageListeners[eventType];
            return controlObject;
        },
        send: function (_a) {
            var type = _a.type, payload = _a.payload;
            if (controlObject.debug) {
                log('Sending message: ' + type);
            }
            worker.postMessage({
                type: type,
                debug: controlObject.debug,
                payload: JSON.stringify(payload)
            });
            return controlObject;
        }
    };
    worker.onmessage = function (e) {
        var data = JSON.parse(e.data);
        var payload = data.payload || {};
        if (controlObject.debug) {
            log('Received message: ' + data.type, payload);
        }
        if (controlObject.messageListeners[data.type]) {
            controlObject.messageListeners[data.type](payload);
        }
    };
    return controlObject;
};

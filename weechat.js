var net = require('net'),
protocol = require('./protocol.js'),
color = require('./color.js');

var client, id = 0,
callbacks = {},
listeners = {},
self = this;

var getbuffers = 'hdata buffer:gui_buffers(*) number,full_name,type,title,local_variables',
getlines1 = 'hdata buffer:',
getlines2 = '/own_lines/first_line(*)/data',
getnicks = 'nicklist';

// This should create styles in the future
exports.style = function(line) {
    return color.parse(line);
};

exports.connect = function(port, password, cb) {
    client = net.connect(port, function() {
        var err = false;
        self.write('init password=' + password + ',compression=off');
        // Ping test password 
        self.write('info version');
        client.on('end', function() {
            err = 'Wrong password';
        });
        setTimeout(function() {
            if (!err) {
                client.on('data', onData);
                self.write('sync');
            }
            if (cb) {
                cb(err);
            }
        },
        100);
    });
    client.on('error', function(err) {
        cb(err);
    });
};

exports.on = function(listener, cb) {
    if (arguments.length === 1) {
        cb = listener;
        listener = '*';
    }
    if (!listeners[listener]) {
        listeners[listener] = [];
    }
    listeners[listener].push(cb);
};

exports.write = function(msg, cb) {
    id++;
    callbacks[id] = cb;
    client.write('(' + id + ') ' + msg + '\n');
};

exports.version = function(cb) {
    if (cb) {
        self.write('info version', function(v) {
            cb(v.value);
        });
    }
};

exports.buffers = function(cb) {
    if (cb) {
        self.write(getbuffers, function(buffers) {
            buffers = buffers.map(function(buffer) {
                var lv = buffer.local_variables;
                return {
                    id: '0x' + buffer.pointers[0],
                    number: buffer.number,
                    fullName: buffer.full_name,
                    typeId: buffer.type,
                    title: buffer.title,
                    plugin: lv.plugin,
                    channel: lv.channel,
                    nick: lv.nick,
                    type: lv.type,
                    name: lv.name
                };
            });
            cb(buffers);
        });
    }
};

exports.lines = function(bufferid, cb) {
    if (arguments.length === 1) {
        cb = bufferid;
        bufferid = 'gui_buffers(*)';
    }
    if (cb) {
        self.write(getlines1 + bufferid + getlines2, function(lines) {
            lines = lines.map(function(line) {
                return {
                    buffer: '0x' + line.pointers[0],
                    prefix: line.prefix,
                    date: line.date,
                    displayed: line.displayed,
                    message: line.message
                };
            });
            cb(lines);
        });
    }
};

exports.bufferlines = function(cb) {
    if (cb) {
        self.buffers(function(buffers) {
            self.lines(function(lines) {
                lines.forEach(function(line) {
                    buffers.filter(function(buffer) {
                        return buffer.id.match(line.buffer);
                    }).forEach(function(buffer){
                        if (!buffer.lines) {
                            buffer.lines = [];
                        }
                        buffer.lines.push(line);
                    });
                });
                cb(buffers);
            });
        });    
    }
};

exports.onLine = function(cb) {
    self.on('_buffer_line_added', cb);
};

exports.onOpen = function(cb) {
    self.on('_buffer_opened', cb);
};

exports.onClose = function(cb) {
    self.on('_buffer_closing', cb);
};

exports.onRenamed = function(cb) {
    self.on('_buffer_renamed', cb);
};

exports.onLocalvar = function(cb) {
    self.on('_buffer_localvar_added', cb);
};

exports.onTitle = function(cb) {
    self.on('_buffer_title_change', cb);
};

exports.onNicklist = function(cb) {
    self.on('_nicklist', cb);
};

function onData(data) {
    protocol.data(data, function(id, obj) {
        cb = callbacks[id];
        if (cb) {
            cb(obj);
            delete callbacks[id];
        }

        [id, '*'].forEach(function(l) {
            if (listeners[l]) {
                listeners[l].forEach(function(cb) {
                    obj.forEach(function(o) {
                        o.pointers = o.pointers.map(function(p) {
                            if (!p.match(/^0x/)) {
                                return '0x' + p;
                            }
                            return p;
                        });
                        if (o.buffer && !o.buffer.match(/^0x/)) {
                            o.buffer = '0x' + o.buffer;
                        }
                        cb(o, id);
                    });
                });
            }
        });
    });
}


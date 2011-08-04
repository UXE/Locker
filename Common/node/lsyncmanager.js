var fs = require('fs')
  , path = require('path')
  , lconfig = require("lconfig")
  , spawn = require('child_process').spawn
  , datastore = require('./synclet/datastore')
  , datastoreinit = false
  , async = require('async')
  , EventEmitter = require('events').EventEmitter
  ;

var synclets = {
    available:[],
    installed:{}
};

exports.eventEmitter = new EventEmitter();

exports.synclets = function() {
  return synclets;
};

/**
* Scans the Me directory for instaled synclets
*/
exports.findInstalled = function () {
    synclets.installed = {};
    if (!path.existsSync(lconfig.me + "/synclets/")) fs.mkdirSync(lconfig.me + "/synclets/", 0755);
    var dirs = fs.readdirSync(lconfig.me + "/synclets/" );
    for (var i = 0; i < dirs.length; i++) {
        var dir =  lconfig.me + '/synclets/' + dirs[i];
        try {
            if(!fs.statSync(dir).isDirectory()) continue;
            if(!fs.statSync(dir+'/me.json').isFile()) continue;
            var js = JSON.parse(fs.readFileSync(dir+'/me.json', 'utf-8'));
            synclets.installed[js.id] = js;
            synclets.installed[js.id].status = "waiting";
            if (js.frequency) scheduleRun(js);
        } catch (E) {
            console.log("Me/synclets/"+dirs[i]+" does not appear to be a synclet (" +E+ ")");
        }
    }
}

exports.scanDirectory = function(dir) {
    var files = fs.readdirSync(dir);
    for (var i = 0; i < files.length; i++) {
        var fullPath = dir + '/' + files[i];
        var stats = fs.statSync(fullPath);
        if(stats.isDirectory()) {
            exports.scanDirectory(fullPath);
            continue;
        }
        if (RegExp("\\.synclet$").test(fullPath)) {
            mapMetaData(fullPath);
        }
    }
}

/**
* Install a synclet
*/
exports.install = function(metaData) {
    var serviceInfo;
    synclets.available.some(function(svcInfo) {
        if (svcInfo.srcdir == metaData.srcdir) {
            serviceInfo = {};
            for(var a in svcInfo){serviceInfo[a]=svcInfo[a];}
            return true;
        }
        return false;
    });
    if (!serviceInfo) return serviceInfo;
    var authInfo;
    // local/internal name for the service on disk and whatnot, try to make it more friendly to devs/debugging
    if(serviceInfo.handle) {
        try {
            var apiKeys = JSON.parse(fs.readFileSync(lconfig.lockerDir + "/" + lconfig.me + "/apikeys.json", 'ascii'));
            authInfo = apiKeys[serviceInfo.provider];
        } catch (E) { console.dir(E); }
        // the inanity of this try/catch bullshit is drrrrrrnt but async is stupid here and I'm offline to find a better way atm
        var inc = 0;
        try {
            if(fs.statSync(lconfig.lockerDir+"/" + lconfig.me + "/synclets/"+serviceInfo.handle).isDirectory()) {
                inc++;
                while(fs.statSync(lconfig.lockerDir+"/" + lconfig.me + "/synclets/"+serviceInfo.handle+"-"+inc).isDirectory()) {inc++;}
            }
        } catch (E) {
            var suffix = (inc > 0)?"-"+inc:"";
            serviceInfo.id = serviceInfo.handle+suffix;
        }
    } else {
        var hash = crypto.createHash('md5');
        hash.update(Math.random()+'');
        serviceInfo.id = hash.digest('hex');
    }
    synclets.installed[serviceInfo.id] = serviceInfo;
    fs.mkdirSync(lconfig.lockerDir + "/" + lconfig.me + "/synclets/"+serviceInfo.id,0755);
    if (authInfo) serviceInfo.auth = authInfo;
    fs.writeFileSync(lconfig.lockerDir + "/" + lconfig.me + "/synclets/"+serviceInfo.id+'/me.json',JSON.stringify(serviceInfo, null, 4));
    if (serviceInfo.frequency) scheduleRun(serviceInfo);
    return serviceInfo;
}

exports.isInstalled = function(serviceId) {
    return serviceId in synclets.installed;
}

exports.status = function(serviceId) {
    return synclets.installed[serviceId];
};

exports.syncNow = function(serviceId, callback) {
    if (!synclets.installed[serviceId]) return callback("no service like that installed");
    executeSynclet(synclets.installed[serviceId], callback);
};

/**
* Add a timeout to run a synclet
*/
function scheduleRun(info) {
    info.nextRun = new Date() + parseInt(info.frequency);
    setTimeout(function() {
        executeSynclet(info);
    }, parseInt(info.frequency) * 1000);
};

/**
* Executes a synclet
*/
function executeSynclet(info, callback) {
    if (info.status === 'running') {
        return callback('already running');
    }
    info.status = "running";
    if (!info.run) {
        run = ["node", lconfig.lockerDir + "/Common/node/synclet/client.js"];
    } else {
        run = info.run.split(" "); // node foo.js
    }

    process.env["NODE_PATH"] = lconfig.lockerDir+'/synclets';
    var dataResponse = '';
    app = spawn(run.shift(), run, {cwd: lconfig.lockerDir + '/' + lconfig.me + '/synclets/' + info.id, env:process.env});
    
    app.stderr.on('data', function (data) {
        var mod = console.outputModule;
        console.outputModule = info.title;
        console.error(data);
        console.outputModule = mod;
    });

    app.stdout.on('data',function (data) {
        dataResponse += data;
    });
    
    app.on('exit', function (code,signal) {
        var response;
        try {
            response = JSON.parse(dataResponse);
        } catch (E) {
            console.error(E);
            console.error(dataResponse);
            info.status = 'failed : ' + E;
            if (callback) callback(E);
            return;
        }
        info.status = 'processing data';
        info.config = response.config;
        processResponse(info, response, callback);
        fs.writeFileSync(lconfig.lockerDir + "/" + lconfig.me + "/synclets/" + info.id + '/me.json', JSON.stringify(info, null, 4));
        scheduleRun(info);
    });
    if (!info.config) info.config = {};

    app.stdin.write(JSON.stringify(info)+"\n"); // Send them the process information
};

function processResponse(info, response, callback) {
    datastore.init(function() {
        info.status = 'waiting';

        if (callback) {
            var dataKeys = [];
            for (var i in response.data) {
                dataKeys.push(i);
            }
            async.forEach(dataKeys, function(key, cb) { processData(info, key, response.data[key], cb); }, callback);
        }
        else {
            for (var i in response.data) {
                processData(info, i, response.data[i]);
            }
        }
    });
};

function processData (info, key, data, callback) {
    if (info.mongoId) { 
        datastore.addCollection(key, info.id, info.mongoId);
    } else {
        datastore.addCollection(key, info.id, "id");
    }
    async.forEach(data, function(object, cb) {
        newEvent = object;
        newEvent.fromService = info.provider + "/" + info.id;
        exports.eventEmitter.emit(key + "/" + info.provider, newEvent);
        if (object.type === 'delete') {
            datastore.removeObject(info.id + '_' + key, object.obj[info.mongoId], {timeStamp: object.timestamp}, cb);
        } else {
            // exports.addObject = function(type, object, options, callback) {
            datastore.addObject(info.id + "_" + key, object.obj, {timeStamp: object.timestamp}, cb);
        }
    }, callback);
}

/**
* Map a meta data file JSON with a few more fields and make it available
*/
function mapMetaData(file) {
    var metaData = JSON.parse(fs.readFileSync(file, 'utf-8'));
    metaData.srcdir = path.dirname(file);
    synclets.available.push(metaData);
    return metaData;
}
function log(m) { if (console && console.log) console.log(m); }

$(document).ready(
    function() {
        var _s = [{
                      action: "Click on the service you'd like to add first:",
                      desc: "You must install one service in order to use your locker."
                  },
                  {
                      action: "Your data is syncing in the background:",
                      desc: "Click on another service to make your Locker more awesome!"
                  },
                  {
                      action: "Wow! You're a social-web powerhouse!",
                      desc: "Click 'Next' to continue."                      
                  }
                 ];


        var CountPoll = (
            function () {
                var CountPoll = function (name) {
                    var t = this;
                    t.name = name;
                    t.lastCount = 0;
                    t.count = 0;
                    
                    t.handleResponse = function(data, err, resp) {
                        t.lastCount = t.count;
                        t.count = data.count;
                        if (t.count != t.lastCount) {
                            $("#"+t.name+"Count").odoTicker(
                                {
	                            number: data.count ? data.count : 0, //Number to load
	                            speed: 1500, //speed in ms
	                            height: 28 	 //height of a single number in the CSS sprite
                                }
                            );
                        }
                        if (t.lastCount == 0 && t.count != 0) {
                            $("#wizard-collections").slideDown();
                            $("#wizard-actions").fadeIn();
                            $("#popup h2").html(_s[1].action).next().html(_s[1].desc);
                        }

                        t.timeout = setTimeout(t.query, 1000);
                    };

                    t.query = function() {
                        var url = "/Me/"+t.name+"/state";
                        $.ajax({
                                   url: url,
                                   dataType: 'json',
                                   success: t.handleResponse,
                                   error: function(e) {
                                       // assume it will become available later
                                       t.timeout = setTimeout(t.query, 3000);
                                   }
                               });
                    };

                    t.halt = function() {
                        clearTimeout(t.timeout);
                    };
                    
                    // init
                    t.query();
                    $("#"+t.name+"Count").odoTicker(
                        {
	                    number: 0,   //Number to load
	                    speed: 1500, //speed in ms
	                    height: 28   //height of a single number in the CSS sprite
                        });
                };
                
                return function (name) {
                    return new CountPoll(name);
                };

            })();
       
        /* 
         * SyncletPoll
         */
        var SyncletPoll = (
            function () {
                var SyncletPoll = function () {
                    var t = this;
                    t.uri = "/synclets";
                    t.buttonsConnected = false;
                    t.installed = {};

                    var app = {};

                    t.pending = function(provider) {
                        if (typeof(t.installed[provider]) == "undefined") {
                            var b =  {
                                "state": "pending",
                                "$el": $("#"+provider+"Connect a:first")
                            };
                            
                            b.$el.addClass("pending disabled");
                            
                            b.spinner = spinner(b.$el.parent().parent().children(".spinner").get(0), 15, 20, 20, 4, "#aaa");
                            
                            t.installed[provider] = b;
                        }
                    };

                    t.handleResponse = function(data, err, resp) {
                        var wizardApps = ["facebook", "twitter", "gcontacts", "github", "foursquare"];
                        if (!t.buttonsConnected) {
                            for (app in data.available) {
                                app = data.available[app];
                                
                                if (wizardApps.indexOf(app.provider) != -1 && typeof(app.authurl) != "undefined") {
                                    // update app button with the correct link
                                    var $el = $("#"+ app.provider + "Connect a:first");
                                    // change link
                                    $el.attr("href", app.authurl);
                                    $el.attr("target", "_blank");
                                }
                            }
                            t.buttonsConnected = true;
                        }
                            
                        for (app in data.installed) {
                            app = data.installed[app];

                            if (wizardApps.indexOf(app.provider) != -1) {
                                // update app button with "pending" gfx
                                t.pending(app.provider);
                            }
                        }
                        
                        t.timeout = setTimeout(t.query, 1000);
                    };

                    t.query = function() {
                        var url = t.uri;
                        $.ajax({
                                   url: url,
                                   dataType: 'json',
                                   success: t.handleResponse,
                                   error: function(e) {
                                       // assume it will become available later
                                       t.timeout = setTimeout(t.query, 3000);
                                   }
                               });
                    };

                    t.halt = function() {
                        clearTimeout(t.timeout);
                    };
                                        
                    // init
                    t.query();
                };
                
                return function () {
                    return new SyncletPoll();
                };

            })();
            
        function spinner(container, R1, R2, count, stroke_width, colour) {
            var sectorsCount = count || 12,
            color = colour || "#fff",
            width = stroke_width || 15,
            r1 = Math.min(R1, R2) || 35,
            r2 = Math.max(R1, R2) || 60,
            cx = r2 + width,
            cy = r2 + width,
            r = Raphael(container, r2 * 2 + width * 2, r2 * 2 + width * 2),
            
            sectors = [],
            opacity = [],
            beta = 2 * Math.PI / sectorsCount,
            
            pathParams = {stroke: color, "stroke-width": width, "stroke-linecap": "round"};
            Raphael.getColor.reset();
            for (var i = 0; i < sectorsCount; i++) {
                var alpha = beta * i - Math.PI / 2,
                cos = Math.cos(alpha),
                sin = Math.sin(alpha);
                opacity[i] = 1 / sectorsCount * i;
                sectors[i] = r.path([["M", cx + r1 * cos, cy + r1 * sin], ["L", cx + r2 * cos, cy + r2 * sin]]).attr(pathParams);
                if (color == "rainbow") {
                    sectors[i].attr("stroke", Raphael.getColor());
                }
            }
            var tick;
            (function ticker() {
                 opacity.unshift(opacity.pop());
                 for (var i = 0; i < sectorsCount; i++) {
                     sectors[i].attr("opacity", opacity[i]);
                 }
                 r.safari();
                 tick = setTimeout(ticker, 1000 / sectorsCount);
             })();
            return function () {
                clearTimeout(tick);
                r.remove();
            };
        }
        
        $('#popup').live('pagecreate',function(event){
                             // collections
                             window.photoCountPoll = new CountPoll("photos");
                             window.linkCountPoll = new CountPoll("links");
                             window.contactCountPoll = new CountPoll("contacts");
                             
                             // synclets
                             window.syncletPoll = new SyncletPoll();
                         });
    }
);				

/*
 * Account Popup
 */
function accountPopup (url) {
    var popup = window.open(url, "account", "width=620,height=400,status=no,scrollbars=no,resizable=no");
    popup.focus();
}
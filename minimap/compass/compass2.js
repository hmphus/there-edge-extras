There.init({
  data: {
    location: {},
    places: {},
    tracks: {},
    zoom: 10,
    windows: {
      version: 0,
      names: {},
    },
  },

  onReady: function() {
    There.fsCommand('setStageWidthHeight', {
      width: 200,
      height: 200,
    });
    There.fsCommand('setTextureBitDepth', {
      depth: 32,
    });
    new ResizeObserver(function(entries) {
      const rect = entries[0].contentRect;
      There.fsCommand('setWidthHeight', {
        width: rect.width,
        height: rect.height,
      });
    }).observe($('.compass')[0]);
  },

  onVariable: function(name, value) {
    if (name == 'there_teleporting' || name == 'there_ready') {
      $('.compass').attr(name.replace('there_', 'data-'), value);
    }
    if (name == 'there_avheading') {
      $('.compass .main').css('--heading', `${value}deg`);
    }
    if (name == 'there_ready' && value == 1) {
      There.fetchPilotXml(),
      There.fetchLocationXml();
      There.fetchPlaces();
    }
    if (name == 'there_configurationchanged' && value == 1) {
      There.setNamedTimer('pilot', 1000, There.fetchPilotXml);
    }
  },

  fetchPilotXml: async function() {
    await There.fetchAsync({
      path: '/ClientLoginGui/pilotInfo',
      dataType: 'xml',
      success: There.onPilotXml,
    });
  },

  onPilotXml: function(xml) {
    const xmlAnswer = xml.getElementsByTagName('Answer')[0];
    const doid = Number(xmlAnswer.getElementsByTagName('PilotDoid')[0].childNodes[0].nodeValue);
    const name = xmlAnswer.getElementsByTagName('PilotName')[0].childNodes[0].nodeValue;
    if (doid != 0 && name != '') {
      There.variables.there_pilotdoid = doid;
      There.variables.there_pilotname = name;
      $('.compass').attr('data-ready', '1');
    }
  },

  fetchLocationXml: function() {
    There.fetch({
      path: `/ihost/doblocation`,
      query: {
        doid: There.variables.there_pilotdoid,
      },
      dataType: 'xml',
      success: function(xml) {
        There.onLocationXml(xml);
      },
      complete: function(jqXHR, status) {
        There.setNamedTimer('fetch-location', 1000, function() {
          There.fetchLocationXml();
        });
      },
    });
  },

  onLocationXml: function(xml) {
    var position;
    try {
      const xmlAnswer = xml.getElementsByTagName('answer')[0];
      position = {
        x: Number(xmlAnswer.getElementsByTagName('posX')[0].childNodes[0].nodeValue),
        y: Number(xmlAnswer.getElementsByTagName('posY')[0].childNodes[0].nodeValue),
        z: Number(xmlAnswer.getElementsByTagName('posZ')[0].childNodes[0].nodeValue),
      };
    } catch(error) {
      return;
    }
    There.calcLocation(There.data.location, position, {
      onPosition: function(position) {
        let height = Math.floor(Math.max(Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z) - 6000000.0, 0.0));
        let text = '';
        if (height < 1000) {
          text = Number(height).toLocaleString('en-us', {
            maximumFractionDigits: 0,
          }) + 'm';
        } else {
          let digits = Math.max(0, 6 - height.toString().length);
          text = Number(height / 1000.0).toLocaleString('en-us', {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
          }) + 'km';
        }
        $('.compass .altimeter span').text(text);
      },
      onOffset: function(offset) {
        $('.compass .main').css('--offset-x', `${offset.x}px`).css('--offset-y', `${offset.y}px`)
      },
      onTile: function(tile) {
        for (let x in [0, 1, 2]) {
          for (let y in [0, 1, 2]) {
            let offsetTile = {
              x: tile.x + (x - 1),
              y: tile.y + (y - 1),
            };
            let url = There.getTileUrl(offsetTile);
            $(`.compass .map .tile[data-x="${x}"][data-y="${y}"]`).css('background-image', `url(${url})`);
            let divIconsTile = $(`.compass .icons .tile[data-x="${x}"][data-y="${y}"]`);
            $(divIconsTile).empty();
            let places = There.getTilePlaces(offsetTile);
            for (let place of places) {
              let divIcon = $('<div class="icon"></div>');
              $(divIcon).css('left', `${Number(place.offset[0])}px`).css('top', `${Number(place.offset[1])}px`);
              $(divIcon).attr('data-type', place.type).attr('title', place.name);
              $(divIcon).on('mouseover', function(event) {
                There.playSound('control rollover');
              });
              $(divIconsTile).append($(divIcon));
            }
          }
        }
      },
    });
  },

  fetchPlaces: function() {
    $.ajax({
      url: 'https://www.hmph.us/there/api/minimap/places/',
      method: 'POST',
      dataType: 'json',
      success: function(data) {
        There.data.places = data.places ?? {};
        There.data.location = {};
      },
    });
  },

  calcLocation: function(location, position, events) {
    if (location.position?.x == position.x && location.position?.y == position.y && location.position?.z == position.z) {
      return;
    }
    location.position = position;
    events?.onPosition?.(position);
    var longitude = 0.000109861473792 * position.x + 4.11852320371869;
    var latitude;
    if (position.y < 1000000.0) {
        latitude = 2.64704299694757e-11 * position.y * position.y + 0.0000284144760656428 * position.y - 75.0109756775465;
    } else {
        latitude = -2.83863583089598e-09 * position.y * position.y + 0.0112260357825775 * position.y - 11028.605321244;
    }
    let scale = 1 << There.data.zoom;
    let sinY = Math.min(Math.max(Math.sin(latitude * Math.PI / 180.0), -0.9999), 0.9999);
    let point = {
      x: scale * (0.5 + longitude / 360.0),
      y: scale * (0.5 - Math.log((1.0 + sinY) / (1.0 - sinY)) / (4.0 * Math.PI)),
    };
    let offset = {
      x: 128 - (Math.floor(point.x * 256.0) % 256),
      y: 128 - (Math.floor(point.y * 256.0) % 256),
    };
    if (location.offset?.x != offset.x || location.offset?.y != offset.y) {
      location.offset = offset;
      events?.onOffset?.(offset);
    }
    let tile = {
      x: Math.floor(point.x),
      y: Math.floor(point.y),
    };
    if (location.tile?.x != tile.x || location.tile?.y != tile.y) {
      location.tile = tile;
      events?.onTile?.(tile);
    }
  },

  getTileUrl: function(tile) {
    let zoom = There.data.zoom;
    let url = `https://${There.variables.there_webapps}/gmap/${zoom}-0-0/${zoom}-${tile.y}-${tile.x}.png`;
    if (There.testTile(tile, [64, 4, 104, 2])) {
      return url; // Tiki
    }
    if (There.testTile(tile, [61, 1, 28, 1])) {
      return url; // Frosty
    }
    if (There.testTile(tile, [56, 1, 103, 1])) {
      return url; // Tyr
    }
    if (There.testTile(tile, [62, 2, 109, 2])) {
      return url; // Kansas
    }
    if (There.testTile(tile, [57, 2, 108, 2])) {
      return url; // Comet
    }
    if (There.testTile(tile, [67, 2, 109, 2])) {
      return url; // California
    }
    return `https://${There.variables.there_webapps}/gmap/water.png`;
  },

  getTilePlaces: function(tile) {
    return There.data.places[tile.x]?.[tile.y] ?? [];
  },

  testTile: function(tile, values) {
    let zoom = 1 << (There.data.zoom - 7);
    values = values.map(v => v * zoom);
    return (tile.x >= values[0]) && (tile.x < values[0] + values[1]) && (tile.y >= values[2]) && (tile.y < values[2] + values[3]);
  },

  fetchTracks: function() {
    if ($('.compass .pick').attr('data-loading') == 1) {
      return;
    }
    $('.compass .pick').attr('data-loading', '1');
    $.ajax({
      url: 'https://www.hmph.us/there/api/minimap/tracks/',
      method: 'POST',
      data: {
        avatar_name: There.variables.there_pilotname ?? '',
      },
      dataType: 'json',
      success: function(data) {
        for (let entry of data.tracks) {
          entry.menus = [{
            text: 'Go',
            action: 'go',
            enabled: entry.teleport ? true : false,
          }, {
            text: 'Join',
            action: 'join',
            enabled: true,
          }, {
            text: 'About',
            action: 'about',
            enabled: true,
          }];
        }
        There.data.tracks['*'] = data.tracks ?? [];
        There.setupPick();
      },
      complete: function() {
        $('.compass .pick').attr('data-loading', '0');
      },
    });
  },

  setupPick: function() {
    let divItems = $('.compass .pick .items');
    $(divItems).find('.item').remove();
    for (let entry of There.data.tracks['*']) {
      There.setupPickEntry(divItems, entry);
    }
  },

  setupPickEntry: function(divItems, entry) {
    let divItem = $('<div class="item"></div>');
    let divName = $('<div class="name"></div>');
    $(divItem).attr('data-id', entry.id);
    $(divName).text(entry.name);
    if (There.data.menu?.id == entry.id) {
      $(divItem).attr('data-hover', '1');
    }
    $(divItem).data('entry', entry);
    $(divItem).append($(divName)).appendTo($(divItems));
    $(divItem).on('mouseover', function() {
      const timeout = $('.contextmenu').attr('data-active') == 1 ? 500 : 350;
      There.setNamedTimer('context-menu', timeout, function() {
        if (There.data.menu?.id != entry.id) {
          There.setupContextMenu(divItem, entry);
        }
      });
    }).on('mousemove', function(event) {
      event.stopPropagation();
    }).on('dblclick', function() {
      There.playSound('menu item activate');
      There.clearContextMenu();
      There.fetchTrack(entry.id);
    });
  },

  clearContextMenu: function() {
    There.clearNamedTimer('context-menu');
    $('.contextmenu').attr('data-active', '0');
    $('.compass .pick .items .item').attr('data-hover', '0');
    There.data.menu = {};
  },

  setupContextMenu: function(divItem, entry) {
    let divContextMenu = $('.contextmenu');
    $(divContextMenu).find('.item').remove();
    $('.compass .pick .items .item').attr('data-hover', '0');
    for (let index in entry.menus) {
      const menu = entry.menus[index];
      let divMenuItem = $('<div class="item"></div>');
      let divSound = $('<div class="sound"></div>');
      $(divMenuItem).attr('data-index', index);
      $(divMenuItem).attr('data-enabled', menu.enabled ? '1' : '0');
      $(divSound).text(menu.text);
      $(divMenuItem).append($(divSound)).appendTo($(divContextMenu));
      if (menu.enabled) {
        $(divSound).on('mouseover', function() {
          There.playSound('enabled menu item rollover');
        });
        $(divMenuItem).on('mousedown', function(event) {
          event.stopPropagation();
        }).on('click', function() {
          There.playSound('menu item activate');
          There.clearContextMenu();
          if (menu.action == 'go') {
            There.teleport(entry.teleport);
          }
          if (menu.action == 'join') {
            There.fetchTrack(entry.id);
          }
          if (menu.action == 'about') {
            There.fsCommand('browser', entry.url);
          }
        });
      } else {
        $(divSound).on('mouseover', function() {
          There.playSound('disabled menu item rollover');
        });
      }
    }
    const maxY = $('.compass').height() - $(divContextMenu).height() - 4;
    const top = $(divItem).offset().top;
    const y = Math.min(top + 4, maxY);
    $(divContextMenu).css('top', y).attr('data-active', '1');
    $(divItem).attr('data-hover', '1');
    There.data.menu = {
      id: entry.id,
      top: top,
    };
  },

  teleport: function(id) {
    if (!id) {
      return;
    }
    let url = `https://webapps.prod.there.com/goto/goto?obj=${id}`;
    There.fetchClientWindowsXml(function() {
      There.fsCommand('browser', url);
      setTimeout(function() {
        There.fetchClientWindowsXml(function() {
          for (let name of Object.keys(There.data.windows.names).filter(k => There.data.windows.names[k] == There.data.windows.version)) {
            There.fetchClientWindowCloseButtonXml(name, function() {
              There.fetch({
                path: '/ScriptHook/Invoke',
                query: {
                  Path: `/client/windows/${name}/close`,
                },
                dataType: 'xml',
              });
            });
          }
        });
      }, 2000);
    });
  },

  fetchTrack: function(id) {
    $.ajax({
      url: 'https://www.hmph.us/there/api/minimap/track/',
      method: 'POST',
      data: {
        avatar_name: There.variables.there_pilotname ?? '',
        id: id,
      },
      dataType: 'json',
      success: function(data) {
        There.setupRace(data.track);
      },
    });
  },

  setupRace: function(track) {
    $('.compass').attr('data-mode', 'race');
    $('.compass .race').data('track', track).attr('data-waypoint', '0');
    $('.compass .race .title').text(`${track.name} by ${track.avatar.name}`);
    $('.compass .race .button[data-id="go"]').off('click').on('click', function() {
      There.teleport(track.teleport);
    });
    $('.compass .race .button[data-id="leave"]').off('click').on('click', function() {
      $('.compass').attr('data-mode', 'pick');
      $('.compass .race').attr('data-active', '0');
      $('.compass .race .button[data-id="close"]').attr('data-enabled', '1');
      $('.compass .race .button[data-id="expand"]').attr('data-enabled', '1');
    });
    $('.compass .race .button[data-id="about"]').off('click').on('click', function() {
      There.fsCommand('browser', track.url);
    });
    There.setupRaceWaypoint();
  },

  setupRaceWaypoint: function() {
    let track = $('.compass .race').data('track');
    let index = Number($('.compass .race').attr('data-waypoint'));
    if (index < track.waypoints.length) {
      let waypoint = track.waypoints[index];
      $('.compass .race').attr('data-active', '1');
      $('.compass .race .body[data-id="directions"] span:eq(0)').html(index < track.waypoints.length - 1 ? '&#x2691;' : '&#x272a;');
      $('.compass .race .body[data-id="directions"] span:eq(1)').text(waypoint.name);
      $('.compass .race .button[data-id="go"]').attr('data-enabled', index > 0 || !track.teleport ? '0' : '1');
      $('.compass .race .button[data-id="close"]').attr('data-enabled', index > 0 ? '0' : '1');
      $('.compass .race .button[data-id="expand"]').attr('data-enabled', index > 0 ? '0' : '1');
    } else {
      $('.compass .race').attr('data-active', '0');
      $('.compass .race .button[data-id="go"]').attr('data-enabled', !track.teleport ? '0' : '1');
      $('.compass .race .button[data-id="close"]').attr('data-enabled', '1');
      $('.compass .race .button[data-id="expand"]').attr('data-enabled', '1');
    }
  },

  fetchClientWindowsXml: function(callback) {
    There.data.ident = Math.random();
    There.fetch({
      path: '/ScriptHook/Get',
      query: {
        Path: '/client/windows',
      },
      dataType: 'xml',
      success: There.onClientWindowsXml,
      complete: callback,
    });
  },

  onClientWindowsXml: function(xml) {
    const xmlAnswer = xml.getElementsByTagName('Answer')[0];
    const xmlResult = xmlAnswer.getElementsByTagName('Result')[0];
    if (xmlResult.childNodes[0].nodeValue != 1) {
      return;
    }
    const xmlVersion = xmlAnswer.getElementsByTagName('Version')[0];
    There.data.windows.version = xmlVersion.childNodes[0].nodeValue;
    const xmlNode = xmlAnswer.getElementsByTagName('Node')[0];
    const xmlChildren = xmlNode.getElementsByTagName('Children')[0];
    for (let xmlChild of xmlChildren.childNodes) {
      if (xmlChild.nodeName == 'Child') {
        const name = xmlChild.getElementsByTagName('Name')[0].childNodes[0].nodeValue;
        if (!There.data.windows.names.hasOwnProperty(name)) {
          There.data.windows.names[name] = There.data.windows.version;
        }
      }
    }
  },

  fetchClientWindowCloseButtonXml: function(name, callback) {
    There.data.ident = Math.random();
    There.fetch({
      path: '/ScriptHook/Get',
      query: {
        Path: `/client/windows/${name}/hasCloseButton`,
      },
      dataType: 'xml',
      success: function(xml) {
        if (There.onClientWindowCloseButtonXml(xml)) {
          callback();
        }
      },
    });
  },

  onClientWindowCloseButtonXml: function(xml) {
    const xmlAnswer = xml.getElementsByTagName('Answer')[0];
    const xmlResult = xmlAnswer.getElementsByTagName('Result')[0];
    if (xmlResult.childNodes[0].nodeValue != 1) {
      return false;
    }
    const xmlNode = xmlAnswer.getElementsByTagName('Node')[0];
    const xmlValue = xmlNode.getElementsByTagName('Value')[0];
    if (xmlValue.childNodes[0].nodeValue != 1) {
      return false;
    }
    return true;
  },
});

$(document).ready(function() {
  $('.compass .main').on('mousedown', function(event) {
    if (event.which == 1) {
      There.fsCommand('beginDragWindow');
    }
    There.clearContextMenu();
    event.preventDefault();
    event.stopPropagation();
  });

  $('.contextmenu').on('mousemove', function(event) {
    There.clearNamedTimer('context-menu');
    event.stopPropagation();
  });

  $('.compass').on('mouseleave', function(event) {
    There.setNamedTimer('context-menu', 500, function() {
      There.clearContextMenu();
    });
  }).on('mousemove', function() {
    There.setNamedTimer('context-menu', 350, function() {
      There.clearContextMenu();
    });
  });

  $('.compass .pick .items').on('scroll', function() {
    There.clearContextMenu();
  });

  $('.compass .blocker').on('mousedown', function(event) {
    event.stopPropagation();
  });

  $('.compass .button').on('mouseover', function(event) {
    There.playSound('control rollover');
  }).on('mousedown', function(event) {
    There.playSound('control down');
    There.clearContextMenu();
    event.stopPropagation();
  }).on('mouseup', function(event) {
    There.playSound('control up');
  });

  $('.compass .button[data-id="close"]').on('click', function(event) {
    if (event.shiftKey) {
      There.fsCommand('openDevTools');
    } else {
      There.fsCommand('closeWindow');
    }
  });

  $('.compass .button[data-id="expand"]').on('click', function(event) {
    if (event.shiftKey) {
      There.fsCommand('newChildPluginWindow', {
        id: 'There_gpsd',
        url: `http://${There.variables.there_resourceshost}/Resources/Compass/gpsd.swf`,
      });
    } else {
      if ($('.compass').attr('data-mode') == 'map') {
        $('.compass').attr('data-mode', 'pick');
        There.fetchTracks();
      } else {
        $('.compass').attr('data-mode', 'map');
      }
    }
  });
});
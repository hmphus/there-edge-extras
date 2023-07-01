class DiphyState {
  constructor(data) {
    let self = this;
    self.data = data;
    self.seek();
  }

  align() {
    let self = this;
    if (self.shift < 7) {
      self.offset += 1;
      self.shift = 7;
    }
  }

  seek(offset, shift) {
    let self = this;
    self.offset = offset ?? 0;
    self.shift = shift ?? 7;
  }

  extract(width) {
    let self = this;
    if (self.data.length - self.offset - Math.max(0, Math.ceil((width - self.shift - 1) / 8)) <= 0) {
      throw 'Out of data';
    }
    let value = 0n;
    while (width > 0) {
      let bits = Math.min(width, self.shift + 1);
      value <<= BigInt(bits)
      value |= BigInt((self.data[self.offset] >> (self.shift - bits + 1)) & ((1 << bits) - 1));
      width -= bits;
      self.shift -= bits;
      if (self.shift < 0) {
        self.align();
      }
    }
    return Number(value);
  }

  extract_bool() {
    let self = this;
    let value = self.extract(1);
    return value == 1;
  }

  extract_int(width, start) {
    let self = this;
    start ??= 0;
    return self.extract(width) + start;
  }

  extract_float(width, start, end) {
    let self = this;
    start ??= 0.0;
    end ??= 0.0;
    let step = end > start ? (end - start) / ((1 << width) - 1) : 1.0;
    return self.extract(width) * step + start;
  }
}

There.init({
  data: {
    location: {},
    places: {},
    tracks: {},
    locomotion: {
      pilot: {},
      vehicle: {},
    },
    zoom: 10,
    skipped: false,
    radius: 6000000.0,
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
        width: Math.max(200, Math.ceil(rect.width)),
        height: Math.max(50, Math.ceil(rect.height)),
      });
    }).observe($('.compass')[0]);
  },

  onVariable: function(name, value) {
    if (name == 'there_teleporting' || name == 'there_ready') {
      $('.compass').attr(name.replace('there_', 'data-'), value);
    }
    if (name == 'there_avheading') {
      $('.compass').css('--heading', `${value}deg`);
    }
    if (name == 'there_ready' && value == 1) {
      There.fetchPilot(),
      There.fetchLocation();
      There.fetchPlaces();
      There.fetchLocomotion();
    }
    if (name == 'there_configurationchanged' && value == 1) {
      There.setNamedTimer('pilot', 1000, There.fetchPilot);
    }
  },

  fetchPilot: async function() {
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
      There.data.prefix = `hmph.mods.minimap.${doid}`;
      $('.compass').attr('data-ready', '1');
      $('.compass .login span[data-id="name"]').text(name);
    }
  },

  fetchLocation: function() {
    There.fetch({
      path: '/ihost/doblocation',
      query: {
        doid: There.variables.there_pilotdoid,
      },
      dataType: 'xml',
      success: function(xml) {
        There.onLocationXml(xml);
      },
      complete: function(jqXHR, status) {
        let timeout = $('.compass').attr('data-mode') == 'race' ? 250 : 1000;
        There.setNamedTimer('fetch-location', timeout, function() {
          There.fetchLocation();
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
    There.calcLocation(position);
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

  calcLocation: function(position) {
    let location = There.data.location;
    if (location.position?.x == position.x && location.position?.y == position.y && location.position?.z == position.z) {
      return;
    }
    location.position = position;
    There.updateLocationPosition();
    let normalizer = There.data.radius / Math.sqrt(position.x ** 2 + position.y ** 2 + position.z ** 2);
    let coordinate = {
      x: position.x * normalizer,
      y: position.y * normalizer,
    };
    if (position.z < 0.0) {
      coordinate.x = (coordinate.x < 0.0 ? -2.0 : 2.0) * There.data.radius - coordinate.x;
    }
    var longitude = 0.000109861473792 * coordinate.x + 4.11852320371869;
    var latitude;
    if (coordinate.y < 1000000.0) {
        latitude = 2.64704299694757e-11 * coordinate.y * coordinate.y + 0.0000284144760656428 * coordinate.y - 75.0109756775465;
    } else {
        latitude = -2.83863583089598e-09 * coordinate.y * coordinate.y + 0.0112260357825775 * coordinate.y - 11028.605321244;
    }
    if (location.coordinate?.x != coordinate.x || location.coordinate?.y != coordinate.y) {
      location.coordinate = coordinate;
      There.updateLocationCoordinate();
    }
    let scale = 1 << There.data.zoom;
    let sinY = Math.min(Math.max(Math.sin(latitude * Math.PI / 180.0), -0.9999), 0.9999);
    let point1 = {
      x: scale * (0.5 + longitude / 360.0),
      y: scale * (0.5 - Math.log((1.0 + sinY) / (1.0 - sinY)) / (4.0 * Math.PI)),
    };
    let point2 = {
      x: Math.floor(point1.x * 256.0),
      y: Math.floor(point1.y * 256.0),
    };
    if (location.point?.x != point2.x || location.point?.y != point2.y) {
      location.point = point2;
      There.updateLocationPoint();
    }
    let point3 = {
      x: point1.x,
      y: point1.y,
    };
    if (point1.x >= 536.0 && point1.x < 552.0 && point1.y >= 872.0 && point1.y < 888.0) {
      point3.x += 0.02;
      point3.y += (point3.y - 875.396) * 0.03 + 0.007;
    }
    let point4 = {
      x: Math.floor(point3.x * 256.0),
      y: Math.floor(point3.y * 256.0),
    };
    let offset = {
      x: 128 - (point4.x % 256),
      y: 128 - (point4.y % 256),
    };
    if (location.offset?.x != offset.x || location.offset?.y != offset.y) {
      location.offset = offset;
      There.updateLocationOffset();
    }
    let tile = {
      x: Math.floor(point3.x),
      y: Math.floor(point3.y),
    };
    if (location.tile?.x != tile.x || location.tile?.y != tile.y) {
      location.tile = tile;
      There.updateLocationTile();
    }
  },

  updateLocation: function() {
    There.updateLocationPosition();
    There.updateLocationCoordinate();
    There.updateLocationPoint();
    There.updateLocationOffset();
    There.updateLocationTile();
  },

  updateLocationPosition: function() {
    let position = There.data.location.position;
    if (position == undefined) {
      return;
    }
    let height = Math.floor(Math.max(Math.sqrt(position.x ** 2 + position.y ** 2 + position.z ** 2) - There.data.radius, 0.0));
    $('.compass .altimeter[data-type="text"] span').text(There.getDistanceText(height));
  },

  updateLocationCoordinate: function() {
    let coordinate = There.data.location.coordinate;
    if (coordinate == undefined) {
      return;
    }
    if ($('.compass').attr('data-mode') == 'race' && There.data.track != undefined) {
      let track = There.data.track;
      if (track.index < track.waypoints.length) {
        let waypoint = track.waypoints[track.index];
        let distance = There.getArcDistance(waypoint.position[0], waypoint.position[1], coordinate.x, coordinate.y);
        let distanceText = There.getDistanceText(distance);
        let direction = There.getDirection(waypoint.position[0], waypoint.position[1], coordinate.x, coordinate.y);
        let heading = parseFloat(There.variables.there_avheading ?? 0);
        $('.compass .race .body[data-id="navigation"] ul li:eq(0) span:eq(1)').text(distanceText);
        $('.compass .race .body[data-id="notice"] .text').text(distanceText);
        $('.compass .race .body[data-id="notice"]').css('--direction', `${direction}deg`);
        if (distance > 100000) {
          waypoint.hideNotice = true;
          There.clearNamedTimer('track-waypoint-notice');
          $('.compass .race').attr('data-notice', '0');
        } else if (distance < 200 || Math.abs(There.getNormalizedHeading(direction - heading)) > 60) {
          waypoint.hideNotice = false;
          There.clearNamedTimer('track-waypoint-notice');
          $('.compass .race').attr('data-notice', '1');
        } else {
          if (!waypoint.hideNotice) {
            waypoint.hideNotice = true;
            There.setNamedTimer('track-waypoint-notice', 3000, function() {
              $('.compass .race').attr('data-notice', '0');
            });
          }
        }
        if (distance < 50) {
          let x = coordinate.x;
          let y = coordinate.y;
          There.setNamedTimer('track-waypoint-pass', 50, function() {
            There.passRaceWaypoint(x, y);
          });
        }
      }
    }
  },

  updateLocationPoint: function() {
    let point = There.data.location.point;
    if (point == undefined) {
      return;
    }
    $('.compass svg.navigation').attr('viewBox', `${point.x - 100} ${point.y - 100} 200 200`);
    if ($('.compass').attr('data-mode') == 'race') {
      let navigation = There.data.navigation;
      if (navigation != undefined) {
        navigation = [`${point.x},${point.y}`].concat(navigation);
        $(`.compass svg.navigation polyline[data-id="0"]`).attr('points', navigation.join(' '));
        $(`.compass svg.navigation polyline[data-id="1"]`).attr('points', navigation.slice(0, 2).join(' '));
        $(`.compass svg.navigation polyline[data-id="2"]`).attr('points', navigation.slice(1, 3).join(' '));
        $(`.compass svg.navigation polyline[data-id="3"]`).attr('points', navigation.slice(2).join(' '));
      }
    }
  },

  updateLocationOffset: function() {
    let offset = There.data.location.offset;
    if (offset == undefined) {
      return;
    }
    $('.compass .main').css('--offset-x', `${offset.x}px`).css('--offset-y', `${offset.y}px`)
  },

  updateLocationTile: function() {
  let tile = There.data.location.tile;
    if (tile == undefined) {
      return;
    }
    for (let x of [0, 1, 2]) {
      for (let y of [0, 1, 2]) {
        let offsetTile = {
          x: tile.x + (x - 1),
          y: tile.y + (y - 1),
        };
        let url = There.getTileUrl(offsetTile);
        $(`.compass .map .tile[data-x="${x}"][data-y="${y}"]`).css('background-image', `url(${url})`);
        let divIconsTile = $(`.compass .icons .tile[data-x="${x}"][data-y="${y}"]`);
        $(divIconsTile).empty();
        let icons = There.getTileIcons(offsetTile);
        for (let icon of icons) {
          let divIcon = $('<div class="icon"></div>');
          $(divIcon).css('left', `${Number(icon.offset[0])}px`).css('top', `${Number(icon.offset[1])}px`);
          $(divIcon).attr('data-type', icon.type).attr('title', icon.name);
          $(divIcon).on('mouseover', function(event) {
            There.playSound('control rollover');
          });
          $(divIconsTile).append($(divIcon));
        }
      }
    }
  },

  getArcDistance: function(x1, y1, x2, y2) {
    let d2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
    let distance = Math.floor(Math.max(Math.sqrt(d2), 0.0));
    if (distance > 95240.0) {
      let r2 = There.data.radius ** 2;
      let ah = d2 / (2.0 * r2);
      if (ah > 2.0) {
        ah = 4.0 - ah;
      }
      let angle = Math.acos(1.0 - ah);
      distance = Math.floor(There.data.radius * angle);
    }
    return distance;
  },

  getDistanceText: function(value) {
    if (value < 1000) {
      return Number(value).toLocaleString('en-us', {
        maximumFractionDigits: 0,
      }) + 'm';
    }
    let digits = Math.max(0, 6 - value.toString().length);
    return Number(value / 1000.0).toLocaleString('en-us', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }) + 'km';
  },

  getDirection: function(x1, y1, x2, y2) {
    return There.getNormalizedHeading(270 - Math.round(Math.atan2(y2 - y1, x2 - x1) * 180.0 / Math.PI));
  },

  getNormalizedHeading: function(value) {
    value = value - Math.trunc(value / 360) * 360;
    return value > 180 ? value - 360 : value;
  },

  getDurationText: function(value) {
    let text = '';
    value = Math.floor(value / 1000);
    let seconds = value % 60;
    if (seconds > 0 || value == 0) {
      text = `${seconds} second${seconds == 1 ? '' : 's'}`;
    }
    value = (value - seconds) / 60;
    let minutes = value % 60;
    if (minutes > 0) {
      text = `${minutes} minute${minutes == 1 ? '' : 's'}${text.length == 0 ? '' : ' '}${text}`;
    }
    value = (value - minutes) / 60;
    let hours = value % 24;
    if (hours > 0) {
      text = `${hours} hour${hours == 1 ? '' : 's'}${text.length == 0 ? '' : ' '}${text}`;
    }
    value = (value - hours) / 24;
    let days = value;
    if (days > 0) {
      text = `${days} day${days == 1 ? '' : 's'}${text.length == 0 ? '' : ' '}${text}`;
    }
    return text;
  },

  getSpeed: function(value) {
    return Math.round(Math.floor(Math.sqrt(value.reduce((p, v) => p + v ** 2, 0.0))) * 3.6);
  },

  getSpeedText: function(value) {
    return Number(value).toLocaleString('en-us') + 'km/h';
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
      return url; // Aurora
    }
    return `https://${There.variables.there_webapps}/gmap/water.png`;
  },

  getTileIcons: function(tile) {
    if ($('.compass').attr('data-mode') == 'race') {
      return There.data.waypoints[tile.x]?.[tile.y] ?? [];
    }
    return There.data.places[tile.x]?.[tile.y] ?? [];
  },

  testTile: function(tile, values) {
    let zoom = 1 << (There.data.zoom - 7);
    values = values.map((v) => v * zoom);
    return (tile.x >= values[0]) && (tile.x < values[0] + values[1]) && (tile.y >= values[2]) && (tile.y < values[2] + values[3]);
  },

  fetchLogin: function() {
    if ($('.compass .login').attr('data-loading') == 1) {
      return;
    }
    const password = $('.compass .login input[type="password"]').val();
    if (password == '') {
      return;
    }
    $('.compass .login').attr('data-loading', '1');
    $.ajax({
      url: 'https://www.hmph.us/there/api/minimap/login/',
      method: 'POST',
      data: {
        avatar_name: There.variables.there_pilotname ?? '',
        password: password,
      },
      dataType: 'json',
      success: function(data) {
        if (data.token != null) {
          There.setToken(data.token);
          $('.compass').attr('data-mode', 'pick');
        } else {
          $('.compass .login').attr('data-error', '1');
        }
      },
      complete: function() {
        $('.compass .login').attr('data-loading', '0');
      },
    });
  },

  setToken: function(token) {
    if (There.data.prefix != undefined) {
      window.localStorage.setItem(`${There.data.prefix}.token`, token);
    }
  },

  getToken: function() {
    if (There.data.prefix != undefined) {
      return window.localStorage.getItem(`${There.data.prefix}.token`) ?? '';
    }
    return '';
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
        token: There.getToken(),
        avatar_name: There.variables.there_pilotname ?? '',
      },
      dataType: 'json',
      success: function(data) {
        for (let entry of data.tracks) {
          entry.menus = [{
            text: 'Go',
            action: 'go',
            enabled: entry.teleport ? true : false,
            visible: true,
          }, {
            text: 'Join',
            action: 'join',
            enabled: true,
            visible: true,
          }, {
            text: 'Edit',
            action: 'edit',
            enabled: entry.edit_url ? true : false,
            visible: data.is_editor && data.token ? true : false,
          }, {
            text: 'About',
            action: 'about',
            enabled: true,
            visible: true,
          }].filter((e) => e.visible);
        }
        There.data.tracks['*'] = data.tracks ?? [];
        There.setupPick();
        if (data.token != null) {
          There.setToken(data.token);
        } else if (!There.data.skipped) {
          $('.compass').attr('data-mode', 'login');
          There.fsCommand('getKeyboardFocus');
          $('.compass .login input[type="text"]').val('').focus();
          $('.compass .login .button[data-id="login"]').attr('data-enabled', '0');
          $('.compass .login').attr('data-error', '0').attr('data-editor', data.is_editor ? '1' : '0');
        }
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
            There.fsCommand('TeleportToDoid', {
              doid: entry.teleport,
            });
          }
          if (menu.action == 'join') {
            There.fetchTrack(entry.id);
          }
          if (menu.action == 'edit') {
            There.fsCommand('browser', entry.edit_url);
          }
          if (menu.action == 'about') {
            There.fsCommand('browser', entry.view_url);
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

  fetchTrack: function(id) {
    $.ajax({
      url: 'https://www.hmph.us/there/api/minimap/track/',
      method: 'POST',
      data: {
        token: There.getToken(),
        avatar_name: There.variables.there_pilotname ?? '',
        id: id,
      },
      dataType: 'json',
      success: function(data) {
        There.data.track = data.track;
        There.data.track.index = 0;
        There.setupRace();
      },
    });
  },

  setupRace: function() {
    let track = There.data.track;
    track.time = Date.now();
    if (There.data.audio == undefined) {
      let waypointAudio = new Audio('/resources/gamekit/racekit/right_gate.ogg');
      waypointAudio.volume = 0.35;
      let finishAudio = new Audio('/resources/gamekit/racekit/race_over.ogg');
      finishAudio.volume = 0.35;
      There.data.audio = {
        waypoint: waypointAudio,
        finish: finishAudio,
      };
    }
    $('.compass').attr('data-mode', 'race');
    $('.compass .race .title').text(`${track.name} by ${track.avatar.name}`);
    $('.compass .race .button[data-id="go"]').off('click').on('click', function() {
      if (track.teleport) {
        There.fsCommand('TeleportToDoid', {
          doid: track.teleport,
        });
      }
    });
    $('.compass .race .button[data-id="leave"]').off('click').on('click', function() {
      $('.compass').attr('data-mode', 'pick');
      There.exitRace();
    });
    $('.compass .race .button[data-id="done"]').off('click').on('click', function() {
      $('.compass').attr('data-mode', 'map');
      There.exitRace();
    });
    $('.compass .race .button[data-id="about"]').off('click').on('click', function() {
      There.fsCommand('browser', track.url);
    });
    There.setupRaceWaypoint();
  },

  exitRace: function() {
    There.clearNamedTimer('track-waypoint-pass');
    There.clearNamedTimer('track-waypoint-notice');
    delete There.data.track;
    $('.compass .race').attr('data-active', '0').attr('data-notice', '0');
    $('.compass .button[data-id="close"]').attr('data-enabled', '1');
    $('.compass .button[data-id="expand"]').attr('data-enabled', '1');
    $('.compass .race .body[data-id="summary"]').text('');
    $('.compass .race .body[data-id="navigation"] ul').empty();
  },

  setupRaceWaypoint: function() {
    let track = There.data.track;
    There.data.waypoints = {};
    There.data.navigation = [];
    if (track.index < track.waypoints.length) {
      let ul = $('.compass .race .body[data-id="navigation"] ul');
      $(ul).empty();
      for (let i = track.index; i < track.waypoints.length; i++) {
        let waypoint = track.waypoints[i];
        let id = Math.min(i - track.index + 1, 3);
        waypoint.type = `waypoint${id}`;
        let tileX = waypoint.tile[0];
        let tileY = waypoint.tile[1];
        let pointX = tileX * 256 + waypoint.offset[0];
        let pointY = tileY * 256 + waypoint.offset[1];
        if (There.data.waypoints[tileX] == undefined) {
          There.data.waypoints[tileX] = {};
        }
        if (There.data.waypoints[tileX][tileY] == undefined) {
          There.data.waypoints[tileX][tileY] = [];
        }
        There.data.waypoints[tileX][tileY].unshift(waypoint);
        There.data.navigation.push(`${pointX},${pointY}`);
        let distanceText = '';
        if (i > 0) {
          let waypoint2 = track.waypoints[i - 1];
          let distance = There.getArcDistance(waypoint.position[0], waypoint.position[1], waypoint2.position[0], waypoint2.position[1]);
          distanceText = There.getDistanceText(distance);
        }
        let li = $('<li>');
        $('<span>').text(`${waypoint.name} (`).appendTo($(li));
        $('<span>').text(distanceText).appendTo($(li));
        $('<span>').text(')').appendTo($(li));
        $(ul).append($(li));
      }
      $('.compass .race .title[data-id="notice"]').text(track.waypoints[track.index].name);
      $('.compass .race').attr('data-active', '1').attr('data-notice', '1');
      $('.compass .race .button[data-id="go"]').attr('data-enabled', track.index > 0 || !track.teleport ? '0' : '1');
      $('.compass .button[data-id="close"]').attr('data-enabled', track.index > 0 ? '0' : '1');
      $('.compass .button[data-id="expand"]').attr('data-enabled', track.index > 0 ? '0' : '1');
    } else {
      $('.compass .race .body[data-id="summary"]').text(`You reached the goal in ${There.getDurationText(Date.now() - track.time)}.`);
      $('.compass .race').attr('data-active', '0').attr('data-notice', '0');
      $('.compass .race .button[data-id="go"]').attr('data-enabled', !track.teleport ? '0' : '1');
      $('.compass .button[data-id="close"]').attr('data-enabled', '1');
      $('.compass .button[data-id="expand"]').attr('data-enabled', '1');
    }
    There.updateLocation();
  },

  passRaceWaypoint: function(x, y) {
    if ($('.compass').attr('data-mode') != 'race' || There.data.track == undefined) {
      return;
    }
    let track = There.data.track;
    if (track.index < track.waypoints.length) {
      $.ajax({
        url: 'https://www.hmph.us/there/api/minimap/waypoint/',
        method: 'POST',
        data: {
          token: There.getToken(),
          avatar_name: There.variables.there_pilotname ?? '',
          track_id: track.id,
          index: track.index,
          x: x,
          y: y,
        },
        dataType: 'json',
        success: function(data) {
        },
      });
      if (track.index == 0) {
        track.time = Date.now();
      }
      track.index++;
      There.setupRaceWaypoint();
      if (track.index == track.waypoints.length) {
        There.data.audio.finish.play();
      } else {
        There.data.audio.waypoint.play();
      }
    }
  },

  fetchLocomotion: async function() {
    let locomotion = There.data.locomotion;
    if (locomotion.pilot.doid != There.variables.there_pilotdoid || locomotion.vehicle.doid == null) {
      locomotion.pilot = {
        doid: There.variables.there_pilotdoid,
        interactions: [],
        label: null,
        dasps: null,
      }
      locomotion.vehicle = {};
      await Promise.all([
        There.fetchInteractions(locomotion.pilot.doid, locomotion.pilot),
        There.fetchInteractionLabel(locomotion.pilot.doid, locomotion.pilot),
        There.fetchDobDetails(locomotion.pilot.doid, locomotion.pilot),
      ]);
      if (locomotion.pilot.interactions.length == 0 || locomotion.pilot.label == null || locomotion.pilot.name == null) {
        locomotion.pilot = {};
      }
    }
    let speed = 0;
    if (locomotion.pilot.doid != null) {
      if (locomotion.pilot.interactions.length > 1) {
        if (locomotion.vehicle.doid != null) {
          locomotion.vehicle.dasps = null;
          await There.fetchDobDetails(locomotion.vehicle.doid, locomotion.vehicle);
          if (!There.isRiding(locomotion.pilot, locomotion.vehicle)) {
            locomotion.vehicle = {};
          }
        }
        if (locomotion.vehicle.doid == null) {
          let clides = {};
          await There.fetchClides(clides)
          let avatar = clides.Avatar3[locomotion.pilot.doid];
          delete clides.Avatar3;
          if (avatar != null) {
            let vehicles = [];
            let promises = [];
            for (let [clide, dobs] of Object.entries(clides)) {
              for (let [doid, dob] of Object.entries(dobs)) {
                let distance2 = (dob.pos[0] - avatar.pos[0]) ** 2 + (dob.pos[1] - avatar.pos[1]) ** 2 + (dob.pos[2] - avatar.pos[2]) ** 2;
                if (distance2 < 225) {
                  vehicle = {
                    doid: doid,
                    clide: clide,
                    dasps: null,
                  };
                  vehicles.push(vehicle);
                  promises.push(There.fetchDobDetails(vehicle.doid, vehicle));
                }
              }
            }
            await Promise.all(promises);
            locomotion.vehicle = vehicles.find(function(vehicle) {
              return There.isRiding(locomotion.pilot, vehicle);
            }) ?? {};
          }
        }
      } else {
        locomotion.vehicle = {};
      }
      if (locomotion.vehicle.doid != null) {
        speed = There.getSpeed(locomotion.vehicle.velocity);
        locomotion.vehicle.speed = speed;
        let bars = Math.floor(speed / 10) * 5 + Math.floor(speed % 10 * 0.4);
        $('.compass .speedometer[data-type="bars"]').css('--speed', `${bars}px`);
        $('.compass .speedometer[data-type="bars"]').attr('data-active', '1');
      } else {
        speed = There.getSpeed(locomotion.pilot.velocity);
        locomotion.pilot.speed = speed;
        $('.compass .speedometer[data-type="bars"]').css('--speed', '0px');
        $('.compass .speedometer[data-type="bars"]').attr('data-active', '0');
      }
    }
    $('.compass .speedometer[data-type="text"] span').text(There.getSpeedText(speed));
    let timeout = speed > 0 ? 250 : 1000;
    There.setNamedTimer('fetch-locomotion', timeout, function() {
      There.fetchLocomotion();
    });
  },

  isRiding: function(pilot, vehicle) {
    if (vehicle.name != pilot.label) {
      return false;
    }
    if (vehicle.seats == null) {
      return false;
    }
    if (!vehicle.seats.includes(pilot.doid)) {
      return false;
    }
    return true;
  },

  fetchInteractions: async function(doid, data) {
    await There.fetchAsync({
      path: '/ScriptHook/Get',
      query: {
        Path: `/thobs/${doid}/presence0/interactions`,
      },
      dataType: 'xml',
      success: function(xml) {
        There.onInteractionsXml(xml, data);
      },
    });
  },

  onInteractionsXml: function(xml, data) {
    const xmlAnswer = xml.getElementsByTagName('Answer')[0];
    const xmlResult = xmlAnswer.getElementsByTagName('Result')[0];
    if (xmlResult.childNodes[0].nodeValue != 1) {
      return;
    }
    const xmlNode = xmlAnswer.getElementsByTagName('Node')[0];
    const xmlChildren = xmlNode.getElementsByTagName('Children')[0];
    for (let xmlChild of xmlChildren.childNodes) {
      if (xmlChild.nodeName == 'Child') {
        const xmlName = xmlChild.getElementsByTagName('Name')[0];
        data.interactions.push(xmlName.childNodes[0].nodeValue);
      }
    }
  },

  fetchInteractionLabel: async function(doid, data) {
    await There.fetchAsync({
      path: '/ScriptHook/Get',
      query: {
        Path: `/thobs/${doid}/presence0/interactions/labelTitle`,
      },
      dataType: 'xml',
      success: function(xml) {
        There.onInteractionLabelXml(xml, data);
      },
    });
  },

  onInteractionLabelXml: function(xml, data) {
    const xmlAnswer = xml.getElementsByTagName('Answer')[0];
    const xmlResult = xmlAnswer.getElementsByTagName('Result')[0];
    if (xmlResult.childNodes[0].nodeValue != 1) {
      return;
    }
    const xmlNode = xmlAnswer.getElementsByTagName('Node')[0];
    data.label = xmlNode.getElementsByTagName('Value')[0].childNodes[0].nodeValue;
  },

  fetchClides: async function(data) {
    await There.fetchAsync({
      path: '/ihost/clides',
      query: {
        clide: '',
        sobonly: '',
        doid: '',
      },
      dataType: 'xml',
      success: function(xml) {
        There.onClidesXml(xml, data);
      },
    });
  },

  onClidesXml: function(xml, data) {
    const xmlAnswer = xml.getElementsByTagName('answer')[0];
    const xmlResult = xmlAnswer.getElementsByTagName('success')[0];
    if (xmlResult.childNodes[0].nodeValue != 1) {
      return;
    }
    const clides = ['Avatar3', 'Buggy', 'Hovercraft', 'Hoverpack', 'Hoverboat'];
    for (let clide of clides) {
      data[clide] = {}
    }
    for (let xmlDob of xmlAnswer.childNodes) {
      if (xmlDob.nodeName == 'Dob') {
        let doid = Number(xmlDob.getElementsByTagName('Doid')[0].childNodes[0].nodeValue);
        let clide = xmlDob.getElementsByTagName('Clide')[0].childNodes[0].nodeValue;
        let state = xmlDob.getElementsByTagName('State')[0].childNodes[0].nodeValue;
        if (state != 'Operating' || !clides.includes(clide)) {
          continue;
        }
        let pos = xmlDob.getElementsByTagName('Pos')[0]?.childNodes[0].nodeValue;
        if (pos != null) {
          data[clide][doid] = {
            pos: pos.slice(1, -1).split(',').map((v) => Number(v)),
          };
        }
      }
    }
  },

  fetchDobDetails: async function(doid, data) {
    await There.fetchAsync({
      path: '/ihost/details',
      query: {
        doid: doid,
      },
      dataType: 'html',
      success: function(html) {
        There.onDobDetailsHtml(html, data);
      },
    });
  },

  onDobDetailsHtml: function(html, data) {
    data.dasps = {};
    let text = $(html).find('textarea[name="state"]').val();
    if (text != null) {
      for (let dasp of There.parseDasps(text)) {
        let code = dasp.code;
        if (code != null) {
          delete dasp.code;
          data.dasps[code] = dasp;
        }
      }
    }
    There.processDobDasps(data);
  },

  parseDasps: function(text) {
    let dasps = [];
    let stack = [];
    let key = '';
    let value = '';
    let mode = 0;
    for (let t of text) {
      if (t == '\n') {
          continue;
      } else if (mode == 0) {
        if (t == '=') {
          mode = 1;
        } else if (t == '}') {
          if (key != '') {
            stack[stack.length - 1][1] = key;
          }
          [key, value, type] = stack.pop();
          if (key != '') {
            stack[stack.length - 1][1][key] = value;
          }
          key = '';
          value = '';
          mode = 1;
        } else if (t == ']') {
          [key, value, type] = stack.pop();
          if (key != '') {
            stack[stack.length - 1][1][key] = value;
          }
          key = '';
          value = '';
          mode = 1;
        } else if (t != ' ') {
          key += t;
        }
      } else if (mode == 1) {
        if (t == '"') {
          mode = 2;
        } else if (t == '{') {
          stack.push([key, {}, 0]);
          key = '';
          value = '';
          mode = 0;
        } else if (t == '}') {
          if (key != '') {
            stack[stack.length - 1][1][key] = value;
          }
          [key, value, type] = stack.pop();
          if (stack.length == 0) {
            dasps.push(value);
            mode = 0;
          } else if (key != '') {
            stack[stack.length - 1][1][key] = value;
          }
          key = '';
          value = '';
        } else if (t == '[') {
          stack.push([key, [], 1]);
          key = '';
          value = '';
          mode = 0;
        } else if (t == ']') {
          if (value != '') {
            if (key == '') {
              stack[stack.length - 1][1].push(value);
            } else {
              stack[stack.length - 1][1].push({[key]: value});
            }
          }
          [key, value, type] = stack.pop();
          if (stack.length == 0) {
            dasps.push(value);
            mode = 0;
          } else if (key != '') {
            stack[stack.length - 1][1][key] = value;
          }
          key = '';
          value = '';
        } else if (t == ' ') {
          if (stack[stack.length - 1][2] == 0 && key != '') {
            stack[stack.length - 1][1][key] = value;
          } else if (stack[stack.length - 1][2] == 1 && value != '') {
            if (value[value.length - 1] == ',') {
              value = value.slice(0, -1);
            }
            if (key == '') {
              stack[stack.length - 1][1].push(value);
            } else {
              stack[stack.length - 1][1].push({[key]: value});
            }
          }
          key = '';
          value = '';
          mode = 0;
        } else {
          value += t;
        }
      } else if (mode == 2) {
        if (t == '"') {
          mode = 1;
        } else {
          value += t;
        }
      }
    }
    return dasps;
  },

  processDobDasps: function(dob) {
    dasps = dob.dasps;
    dob.pid = dasps[0]?.dStatic.productId;
    dob.name = dasps[5]?.name.name;
    dob.diphy = new DiphyState((dasps[2]?.local.diphyState ?? '0:').split(':', 2)[1]?.split(',')?.map((v) => Number(v)) ?? []);
    dob.script = null;
    dob.type = null;
    dob.seats = [];
    dob.velocity = [];
    seatOffset = null;
    switch (dob.clide) {
      case 'Buggy':
        dob.script = dasps[38]?.script.filename;
        if (dob.script != null) {
          dob.type = dob.clide;
          dob.seats = [null, null, null, null];
          seatOffset = 75;
        }
        break;
      case 'Hovercraft':
        dob.script = dasps[32]?.aconf.file.filename;
        if (dob.script != null) {
          if (dob.script.startsWith('hc')) {
            dob.type = 'Hoverboard';
            dob.seats = [null];
          }
          if (dob.script.startsWith('hbk')) {
            dob.type = 'Hoverbike';
            dob.seats = [null];
          }
          if (dob.script.startsWith('bacio')) {
            dob.type = 'Bacio';
            dob.seats = [null, null];
          }
          seatOffset = 81;
        }
        break;
      case 'Hoverpack':
        dob.script = dasps[32]?.aconf.file.filename;
        if (dob.script != null) {
          dob.type = dob.clide;
          dob.seats = [null];
          seatOffset = 60;
        }
        break;
      case 'Hoverboat':
        dob.script = dasps[32]?.aconf.file.filename;
        if (dob.script != null) {
          dob.type = dob.clide;
          dob.seats = [null, null, null, null, null];
          seatOffset = 64;
        }
        break;
    }
    try {
      if (dob.diphy.extract_bool()) {
        dob.diphy.extract_float(21, -1024.0, 1024.0);
        dob.diphy.extract_float(21, -1024.0, 1024.0);
        dob.diphy.extract_float(21, -1024.0, 1024.0);
        dob.velocity = [
          dob.diphy.extract_float(18, -1024.0, 1024.0),
          dob.diphy.extract_float(18, -1024.0, 1024.0),
          dob.diphy.extract_float(18, -1024.0, 1024.0),
        ];
        if (seatOffset != null) {
          dob.diphy.seek(seatOffset);
          for (let index in dob.seats) {
            dob.diphy.extract_int(13);
            let state1 = dob.diphy.extract_int(8);
            let state2 = dob.diphy.extract_int(8);
            dob.diphy.align();
            if (state1 != 0 || state2 != 255) {
              if (dob.diphy.extract_bool()) {
                dob.seats[index] = dob.diphy.extract_int(64);
              }
              dob.diphy.align();
            }
          }
        }
      }
    } catch {
    }
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

  $('.compass .login .link').on('click', function() {
    There.fsCommand('browser', 'https://www.hmph.us/there/minimap/about/');
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
    There.fsCommand('closeWindow');
  });

  $('.compass .button[data-id="expand"]').on('click', function(event) {
    if ($('.compass').attr('data-mode') == 'map') {
    $('.compass').attr('data-mode', 'pick');
      There.fetchTracks();
    } else {
      $('.compass').attr('data-mode', 'map');
      There.exitRace();
    }
  });

  $('.compass .login .button[data-id="login"]').off('click').on('click', function() {
    $('.compass .login').attr('data-error', '0');
    There.fetchLogin();
  });

  $('.compass .login .button[data-id="skip"]').off('click').on('click', function() {
    There.data.skipped = true;
    $('.compass').attr('data-mode', 'pick');
  });

  $('.compass .login input[type="password"]').on('keydown keyup change input cut paste', function() {
    const text = $(this).val();
    $('.compass .login .button[data-id="login"]').attr('data-enabled', text != '' ? '1' : '0');
    $('.compass .login').attr('data-error', '0');
  }).on('click', function() {
    if ($(this).is(':hidden') || $(this).is(':focus')) {
      return;
    }
    There.fsCommand('getKeyboardFocus');
    $(this).focus();
  }).on('keypress', function(event) {
    if(event.which == 13 && $(this).val() != '') {
      $('.compass .login .button[data-id="login"]:not([data-enabled="0"])').trigger('click');
    }
  });
});
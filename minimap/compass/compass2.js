There.init({
  data: {
    location: {},
    places: {},
    zoom: 10,
  },

  onReady: function() {
    There.fsCommand('setStageWidthHeight', {
      width: 200,
      height: 200,
    });

    There.fsCommand('setWidthHeight', {
      width: 200,
      height: 200,
    });

    There.fsCommand('setTextureBitDepth', {
      depth: 32,
    });
  },

  onVariable: function(name, value) {
    if (name == 'there_teleporting' || name == 'there_ready') {
      $('.compass').attr(name.replace('there_', 'data-'), value);
    }

    if (name == 'there_avheading') {
      $('.compass').css('--heading', `${value}deg`);
    }

    if (name == 'there_ready' && value == 1) {
      There.fetchLocationXml();
      There.fetchPlaces();
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
        $('.compass').css('--offset-x', `${offset.x}px`).css('--offset-y', `${offset.y}px`)
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
});

$(document).ready(function() {
  $('.compass').on('mousedown', function(event) {
    There.fsCommand('beginDragWindow');
    event.preventDefault();
    event.stopPropagation();
  });

  $('.compass .button[data-id="close"]').on('click', function() {
    There.fsCommand('closeWindow');
  }).on('mouseover', function(event) {
    There.playSound('control rollover');
  }).on('mousedown', function(event) {
    There.playSound('control down');
    event.stopPropagation();
  }).on('mouseup', function(event) {
    There.playSound('control up');
  });
});
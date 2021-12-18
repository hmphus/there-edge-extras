There.init({
  data: {
    position: {},
    offset: {},
    tile: {},
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
    if (name == 'there_teleporting') {
      $('.compass').attr(name.replace('there_', 'data-'), value);
    }

    if (name == 'there_avheading') {
      $('.compass .map').css('transform', `rotate(${-value}deg)`);
    }

    if (name == 'there_ready' && value == 1) {
      There.fetchLocationXml();
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
    if (There.data.position.x == position.x && There.data.position.y == position.y && There.data.position.z == position.z) {
      return;
    }
    There.data.position = position;
    var longitude = 0.000109861473792 * position.x + 4.11852320371869;
    var latitude;
    if (position.y < 1000000.0) {
        latitude = 2.64704299694757e-11 * position.y * position.y + 0.0000284144760656428 * position.y - 75.0109756775465;
    } else {
        latitude = -2.83863583089598e-09 * position.y * position.y + 0.0112260357825775 * position.y - 11028.605321244;
    }
    let sinY = Math.min(Math.max(Math.sin(latitude * Math.PI / 180.0), -0.9999), 0.9999);
    let point = {
      x: 256.0 * (0.5 + longitude / 360.0),
      y: 256.0 * (0.5 - Math.log((1.0 + sinY) / (1.0 - sinY)) / (4.0 * Math.PI)),
    };
    let scale = 1 << There.data.zoom;
    let offset = {
      x: 128 - (Math.floor(point.x * scale) % 256),
      y: 128 - (Math.floor(point.y * scale) % 256),
    };
    if (There.data.offset.x != offset.x || There.data.offset.y != offset.y) {
      There.data.offset = offset;
      $('.compass .map .tile').css('transform', `translate(${offset.x}px, ${offset.y}px)`);
    }
    let tile = {
      x: Math.floor(point.x * scale / 256.0),
      y: Math.floor(point.y * scale / 256.0),
    };
    if (There.data.tile.x != tile.x || There.data.tile.y != tile.y) {
      There.data.tile = tile;
      for (let x in [0, 1, 2]) {
        for (let y in [0, 1, 2]) {
          let url = There.getTileUrl(x - 1, y - 1);
          $(`.compass .map .tile[data-x="${x}"][data-y="${y}"]`).css('background-image', `url(${url})`);
        }
      }
    }
  },

  getTileUrl: function(offsetX, offsetY) {
    let zoom = There.data.zoom;
    let tile = {
      x: There.data.tile.x + offsetX,
      y: There.data.tile.y + offsetY,
    };
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
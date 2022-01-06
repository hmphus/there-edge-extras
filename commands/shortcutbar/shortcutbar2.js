There.init({
  onReady: function() {
    There.fsCommand('setStageWidthHeight', {
      width: Number(There.variables.there_windowwidth ?? 800),
      height: 25,
    });

    There.fsCommand('setWidthHeight', {
      width: Number(There.variables.there_windowwidth ?? 800),
      height: 25,
    });

    There.fsCommand('setTextureBitDepth', {
      depth: 32,
    });
  },

  onVariable: function(name, value) {
    if (name == 'there_windowwidth') {
      There.fsCommand('setStageWidthHeight', {
        width: Number(value),
        height: 25,
      });

      There.fsCommand('setWidthHeight', {
        width: Number(value),
        height: 25,
      });
    }

    if (name == 'there_thisplaceenabled' || name == 'there_instandardview' || name == 'there_inbodyview' ||
        name == 'there_aerialviewallowed' || name == 'there_emotionsflashing' || name == 'there_lastwindowavailable') {
      $('.shortcutbar').attr(name.replace('there_', 'data-'), value);
    }

    if (name == 'there_ready' && value == 1) {
      There.fetchPilotXml();
    }
  },

  fetchPilotXml: function() {
    There.fetch({
      path: '/ClientLoginGui/pilotInfo',
      dataType: 'xml',
      success: There.onPilotXml,
      complete: function() {
        There.fetchCommMessageXml();
      },
    });
  },

  onPilotXml: function(xml) {
    const xmlAnswer = xml.getElementsByTagName('Answer')[0];
    const doid = xmlAnswer.getElementsByTagName('PilotDoid')[0].childNodes[0].nodeValue;
    const name = xmlAnswer.getElementsByTagName('PilotName')[0].childNodes[0].nodeValue;
    if (doid == There.variables.there_pilotdoid) {
      There.variables.there_pilotname = name;
    }
  },

  fetchCommMessageXml: function() {
    There.data.ident = Math.random();
    let query = {
      Oid: 1,
      request: There.data.ident,
    };
    if (There.data.version != undefined) {
      query.lastVer = There.data.version;
    }
    There.fetch({
      path: '/VersionedXmlSvc/CommMessageData',
      query: query,
      dataType: 'xml',
      success: There.onCommMessageXml,
      complete: function() {
        There.setNamedTimer('fetch', 1000, There.fetchCommMessageXml);
      },
    });
  },

  onCommMessageXml: function(xml) {
    const xmlAnswer = xml.getElementsByTagName('Answer')[0];
    const xmlResult = xmlAnswer.getElementsByTagName('Result')[0];
    if (xmlResult.childNodes[0].nodeValue != 1) {
      return;
    }
    const xmlVersion = xmlAnswer.getElementsByTagName('version')[0];
    There.data.version = xmlVersion.childNodes[0].nodeValue;
    const xmlData = xmlAnswer.getElementsByTagName('messageData')[0];
    for (let xmlMsg of xmlData.childNodes) {
      if (xmlMsg.nodeName == 'msg') {
        const author = xmlMsg.getElementsByTagName('authorName')[0].childNodes[0].nodeValue;
        const text = xmlMsg.getElementsByTagName('text')[0].childNodes[0].nodeValue.trim();
        if (author == There.variables.there_pilotname && text.startsWith('/')) {
        }
      }
    }
  },
});
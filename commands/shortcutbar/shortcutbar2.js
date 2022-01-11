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
      Promise.all([
        There.fetchPilotXml(),
        There.fetchConfigJson(),
      ]).then(function() {
        There.fetchCommMessageXml();
      });
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
    const doid = xmlAnswer.getElementsByTagName('PilotDoid')[0].childNodes[0].nodeValue;
    const name = xmlAnswer.getElementsByTagName('PilotName')[0].childNodes[0].nodeValue;
    if (doid == There.variables.there_pilotdoid) {
      There.variables.there_pilotname = name;
    }
  },

  fetchConfigJson: async function() {
    await There.fetchAsync({
      path: '/Resources/shortcutbar/shortcutbar2.json',
      dataType: 'json',
      success: There.onConfigJson,
    });
  },

  onConfigJson: function(json) {
    for (let command in json.commands) {
      entry = json.commands[command];
      for (let alias of entry.aliases ?? []) {
        if (alias != command) {
          json.commands[alias] = entry;
        }
      }
      delete entry.aliases;
    }
    There.data.config = json;
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
        let text = '';
        for (let xmlChild of xmlMsg.getElementsByTagName('text')[0].childNodes) {
          if (xmlChild.tagName == undefined) {
            text += xmlChild.nodeValue;
          } else if (xmlChild.tagName == 'URL') {
            let url = xmlChild.childNodes[0].nodeValue;
            There.data.url = url;
            text += url;
          }
        }
        text = text.trim();
        if (author == There.variables.there_pilotname && text.startsWith('/')) {
          let args = text.split(' ');
          let command = args.shift().slice(1).toLowerCase();
          if (command != '') {
            There.handleListenerCommand(command, args);
          }
        }
      }
    }
  },

  handleListenerCommand: function(command, args) {
    let entry = There.data.config.commands[command];
    if (entry == undefined) {
      return;
    }
    if (args.length > 0) {
      if (entry.arguments == undefined) {
        return;
      }
      if (args.length in entry.arguments) {
        entry = entry.arguments[args.length];
      } else if ('+' in entry.arguments) {
        entry = entry.arguments['+'];
      } else {
        return;
      }
    }
    if (entry.fscommand != undefined) {
      There.fsCommand(entry.fscommand.command, There.applyListenerArgs(entry.fscommand.query, args));
    }
    if (entry.guicommand != undefined) {
      There.guiCommand(entry.guicommand);
    }
    if (entry.scripthook != undefined) {
      let query = {
        Path: entry.scripthook,
      };
      There.fetch({
        path: '/ScriptHook/Invoke',
        query: query,
        dataType: 'xml',
      });
    }
    if (entry.environment != undefined) {
      for (let variable of entry.environment) {
        let query = {
          variable: There.applyListenerArgs(variable.key, args),
          value: There.applyListenerArgs(variable.value, args),
          modify: '',
        };
        There.fetch({
          path: '/environment/top',
          query: query,
          dataType: 'xml',
        });
      }
    }
  },

  applyListenerArgs: function(data, args, joined) {
    if (joined == undefined) {
      joined = args.join(' ');
    }
    if (args.length > 0 && data != undefined) {
      switch (data.constructor.name) {
        case 'String': {
          if (data.includes('$')) {
            for (let i = 0; i < args.length; i++) {
              data = data.replace(`$${i + 1}`, args[i]);
            }
            data = data.replace('$+', joined);
          }
          break;
        }
        case 'Array': {
          entries = data;
          data = [];
          for (let entry of entries) {
            data.push(There.applyListenerArgs(entry, args, joined));
          }
          break;
        }
        case 'Object': {
          entries = data;
          data = {};
          for (let key in entries) {
            data[key] = There.applyListenerArgs(entries[key], args, joined);
          }
          break;
        }
      }
    }
    return data;
  }
});
class ListenerArgProcessor {
  constructor(args) {
    let self = this;
    self.args = args;
    self.joinedArgs = args.join(' ');
  }

  async apply(data) {
    let self = this;
    switch (data?.constructor.name) {
      case 'String': {
        data = await self.fill(data);
        break;
      }
      case 'Array': {
        let entries = data;
        data = [];
        for (let entry of entries) {
          data.push(await self.apply(entry));
        }
        break;
      }
      case 'Object': {
        let entries = data;
        data = {};
        for (let key in entries) {
          data[key] = await self.apply(entries[key]);
        }
        break;
      }
    }
    return data;
  }

  async fill(text) {
    let self = this;
    let index = text.indexOf('$');
    if (index < 0) {
      return text;
    }
    let hint = text.slice(index + 1);
    text = text.slice(0, index);
    if (hint.length == 0) {
      return text;
    }
    if (hint[0] == '$') {
      text += '$';
      text += await self.fill(hint.slice(1));
      return text;
    }
    if (hint[0] == '+') {
      text += self.joinedArgs;
      text += await self.fill(hint.slice(1));
      return text;
    }
    for (let i = 0; i < 9; i++) {
      if (hint[0] == String(i + 1)) {
        if (i < self.args.length) {
          text += self.args[i];
        }
        text += await self.fill(hint.slice(1));
        return text;
      }
    }
    index = hint.indexOf('(');
    if (index < 0) {
      return text;
    }
    let rest = await self.fill(hint.slice(index + 1));
    hint = hint.slice(0, index);
    index = rest.indexOf(')');
    if (index < 0) {
      return text;
    }
    let inner = rest.slice(0, index);
    rest = rest.slice(index + 1);
    switch (hint) {
      case 'var': {
        inner = inner.toLowerCase();
        if (!There.variables.hasOwnProperty(inner)) {
          throw `Variable not found: ${inner}`;
        }
        text += There.variables[inner];
        break;
      }
      case 'encode': {
        text += encodeURIComponent(inner);
        break;
      }
      case 'nametodoid': {
        inner = inner.toLowerCase();
        if (!There.data.avatars.doids.hasOwnProperty(inner)) {
          await There.fetchAsync({
            path: '/AvPro/nametodoid',
            query: {
              avatarname: inner,
              homedoid: There.variables.there_pilotdoid,
            },
            dataType: 'xml',
            success: function(xml) {
              const xmlAnswer = xml.getElementsByTagName('Answer')[0];
              const xmlResult = xmlAnswer.getElementsByTagName('Result')[0];
              if (xmlResult.childNodes[0].nodeValue != 1) {
                return;
              }
              const doid = Number(xmlAnswer.getElementsByTagName('AvatarDoid')[0].childNodes[0].nodeValue);
              const name = xmlAnswer.getElementsByTagName('AvatarName')[0].childNodes[0].nodeValue;
              There.data.avatars.doids[name.toLowerCase()] = doid;
              There.data.avatars.names[doid] = name;
            },
          });
        }
        if (!There.data.avatars.doids.hasOwnProperty(inner)) {
          throw `Avatar not found: ${inner}`;
        }
        text += There.data.avatars.doids[inner];
        break;
      }
      default: {
        throw `Hint not found: ${hint}`;
      }
    }
    text += rest;
    return text;
  }
}

There.init({
  data: {
    avatars: {
      doids: {},
      names: {},
    },
  },

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
    const doid = Number(xmlAnswer.getElementsByTagName('PilotDoid')[0].childNodes[0].nodeValue);
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
            There.variables.there_lasturl = url;
            text += url;
          }
        }
        text = text.trim();
        if (author == There.variables.there_pilotname && text.startsWith('/')) {
          let args = text.split(' ');
          let command = args.shift().slice(1).toLowerCase();
          if (command != '') {
            There.handleListenerCommand(command, args).catch(function(error) {
              console.log(error);
            });
          }
        }
      }
    }
  },

  handleListenerCommand: async function(command, args) {
    let entry = There.data.config.commands[command];
    if (entry == undefined) {
      return;
    }
    let processor = new ListenerArgProcessor(args);
    if (args.length > 0) {
      if (entry.arguments == undefined) {
        return;
      }
      if (entry.arguments.hasOwnProperty(args.length)) {
        entry = entry.arguments[args.length];
      } else if (entry.arguments.hasOwnProperty('+')) {
        entry = entry.arguments['+'];
      } else {
        return;
      }
      if (entry.constructor.name == 'Array') {
        entry = entry.find(function(element) {
          if (entry.match == undefined) {
            return true;
          }
          if (processor.joinedArgs.match(entry.match) != null) {
            return true;
          }
          return false;
        });
      }
    }
    if (entry == undefined) {
      return;
    }
    if (entry.fscommand != undefined) {
      There.fsCommand(entry.fscommand.command, await processor.apply(entry.fscommand.query));
    }
    if (entry.guicommand != undefined) {
      There.guiCommand(await processor.apply(entry.guicommand));
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
    if (entry.fetch != undefined) {
      There.fetch({
        path: entry.fetch.path,
        query: await processor.apply(entry.fetch.query ?? {}),
        dataType: 'xml',
      });
    }
    if (entry.environment != undefined) {
      let environment = entry.environment.constructor.name == 'Object' ? [entry.environment] : entry.environment;
      for (let variable of environment) {
        let query = {
          variable: await processor.apply(variable.key),
          value: await processor.apply(variable.value),
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
});
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
        let key = inner.toLowerCase();
        index = inner.indexOf(',');
        if (index >= 0) {
          key = key.slice(0, index);
          inner = inner.slice(index + 1).trimLeft();
        }
        if (!There.variables.hasOwnProperty(key)) {
          if (index < 0) {
            throw `Variable not found: ${key}`;
          }
          text += inner;
        } else {
          text += There.variables[key];
        }
        break;
      }
      case 'storage': {
        if (There.data.prefix == undefined) {
          throw `Storage prefix not set`;
        }
        let key = inner.toLowerCase();
        index = inner.indexOf(',');
        if (index >= 0) {
          key = key.slice(0, index);
          inner = inner.slice(index + 1).trimLeft();
        }
        key = `${There.data.prefix}.${key}`;
        let value = window.localStorage.getItem(key);
        if (value == null) {
          if (index < 0) {
            throw `Storage not found: ${key}`;
          }
          text += inner;
        } else {
          text += value;
        }
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
      case 'time': {
        let now = new Date();
        inner = Array.from(inner);
        while (inner.length > 0) {
          let char = inner.shift();
          if (char != '%') {
            text += char;
            continue;
          }
          char = inner.shift();
          let zero = (char == '0');
          if (zero) {
            char = inner.shift();
          }
          switch (char) {
            case 'a': {
              text += ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
              break;
            }
            case 'A': {
              text += ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
              break;
            }
            case 'b': {
              text += ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()];
              break;
            }
            case 'B': {
              text += ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][now.getMonth()];
              break;
            }
            case 'C': {
              text += String(Math.floor(now.getFullYear() / 100));
              break;
            }
            case 'd': {
              if (zero) {
                text += String(now.getDate() + 100).slice(-2);
              } else {
                text += String(now.getDate());
              }
              break;
            }
            case 'f': {
              if (zero) {
                text += String(now.getMilliseconds() + 1000).slice(-3);
              } else {
                text += String(now.getMilliseconds());
              }
              break;
            }
            case 'H': {
              if (zero) {
                text += String(now.getHours() + 100).slice(-2);
              } else {
                text += String(now.getHours());
              }
              break;
            }
            case 'I': {
              let hour = ((now.getHours() + 11) % 12) + 1;
              if (zero) {
                text += String(hour + 100).slice(-2);
              } else {
                text += String(hour);
              }
              break;
            }
            case 'j': {
              // Day of the year (1-366)
              throw `Format not implemented: %${char}`;
            }
            case 'm': {
              if (zero) {
                text += String(now.getMonth() + 101).slice(-2);
              } else {
                text += String(now.getMonth() + 1);
              }
              break;
            }
            case 'M': {
              if (zero) {
                text += String(now.getMinutes() + 100).slice(-2);
              } else {
                text += String(now.getMinutes());
              }
              break;
            }
            case 'p': {
              text += now.getHours() < 12 ? 'am' : 'pm';
              break;
            }
            case 'S': {
              if (zero) {
                text += String(now.getSeconds() + 100).slice(-2);
              } else {
                text += String(now.getSeconds());
              }
              break;
            }
            case 'U': {
              // Week number with the first Sunday as the first day of week one (0-53)
              throw `Format not implemented: %${char}`;
            }
            case 'V': {
              // ISO 8601 week number (1-53)
              throw `Format not implemented: %${char}`;
            }
            case 'w': {
              text += String(now.getDay());
              break;
            }
            case 'W': {
              // Week number with the first Monday as the first day of week one (0-53)
              throw `Format not implemented: %${char}`;
            }
            case 'y': {
              if (zero) {
                text += String(now.getYear() + 100).slice(-2);
              } else {
                text += String(now.getYear() % 100);
              }
              break;
            }
            case 'Y': {
              text += String(now.getFullYear());
              break;
            }
            case 'z': {
              // ISO 8601 offset from UTC in timezone
              throw `Format not implemented: %${char}`;
            }
            case 'Z': {
              // Timezone name or abbreviation
              throw `Format not implemented: %${char}`;
            }
            case '%': {
              text += '%';
              break;
            }
            default: {
              throw `Format not valid: %${char}`;
            }
          }
        }
        break;
      }
      default: {
        throw `Hint not valid: ${hint}`;
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
    session: {},
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
    if (name == 'there_pilotdoid') {
      There.data.prefix = `hmph.mods.commandbar.${value}`;
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
        if (author == There.variables.there_pilotname) {
          if (text.startsWith('/')) {
            let args = text.split(' ');
            let command = args.shift().slice(1).toLowerCase();
            if (command != '') {
              There.handleListenerCommand(command, args).catch(function(error) {
                console.log(error);
              });
            }
          }
        } else if (author.toLowerCase() == There.data.session.puppeteer?.toLowerCase()) {
          for (let emote of text.matchAll(/['`]+[a-zA-Z0-9]+/g)) {
            There.addChatText(emote[0] + emote[0][0]);
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
      if (entry.constructor.name != 'Array') {
        entry = [entry];
      }
      entry = entry.find(function(element) {
        if (element.match == undefined) {
          return true;
        }
        if (processor.joinedArgs.match(element.match) != null) {
          return true;
        }
        return false;
      });
    }
    if (entry == undefined) {
      return;
    }
    if (entry.storage != undefined && There.data.prefix != undefined) {
      let pairs = entry.storage.constructor.name == 'Object' ? [entry.storage] : entry.storage;
      for (let pair of pairs) {
        let key = await processor.apply(pair.key);
        let value = await processor.apply(pair.value);
        window.localStorage.setItem(`${There.data.prefix}.${key.toLowerCase()}`, value);
      }
    }
    if (entry.session != undefined) {
      let pairs = entry.session.constructor.name == 'Object' ? [entry.session] : entry.session;
      for (let pair of pairs) {
        let key = await processor.apply(pair.key);
        let value = await processor.apply(pair.value);
        There.data.session[key.toLowerCase()] = value;
      }
    }
    if (entry.environment != undefined) {
      let pairs = entry.environment.constructor.name == 'Object' ? [entry.environment] : entry.environment;
      for (let pair of pairs) {
        There.fetch({
          path: '/environment/top',
          query: {
            variable: await processor.apply(pair.key),
            value: await processor.apply(pair.value),
            modify: '',
          },
          dataType: 'xml',
        });
      }
    }
    if (entry.fscommand != undefined) {
      There.fsCommand(entry.fscommand.command, await processor.apply(entry.fscommand.query));
    }
    if (entry.guicommand != undefined) {
      There.guiCommand(await processor.apply(entry.guicommand));
    }
    if (entry.scripthook != undefined) {
      There.fetch({
        path: '/ScriptHook/Invoke',
        query: {
          Path: entry.scripthook,
        },
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
    if (entry.browser != undefined) {
      let query = entry.browser.constructor.name == 'Object' ? entry.browser : {
        'url': entry.browser,
      };
      let autoclose = query.autoclose ?? false
      There.fsCommand('browser', await processor.apply(query.url));
    }
    if (entry.chat != undefined) {
      There.addChatText(await processor.apply(entry.chat));
    }
    if (entry.function != undefined) {
      let parameters = entry.function.constructor.name == 'String' ? [entry.function] : entry.function;
      There.listenerFunctions[parameters[0]].apply(null, parameters.slice(1));
    }
  },

  addChatText(text) {
    if (text.length == 0) {
      return;
    }
    There.fetch({
      path: '/ScriptHook/Invoke',
      query: {
        Path: '/acc/addChatText',
        Args: `text=${text.substring(0, 80)}\n`,
      },
      dataType: 'xml',
    });
  },

  listenerFunctions: {
  },
});
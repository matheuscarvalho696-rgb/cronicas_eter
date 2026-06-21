/*
Crônicas do Éter — Exportador Roll20 v44

Comando principal:
!cde-export

Ele exporta:
- Characters: nome, avatar, Bio & Info em HTML e texto limpo.
- Handouts: nome, avatar, Notes em HTML e texto limpo.
- Opcional: GM Notes com !cde-export --gmnotes

Depois ele cria/atualiza o handout "CDE Export JSON".
Abra esse handout, copie o JSON e cole no site.
*/
var CDE_ROLL20_EXPORTER = CDE_ROLL20_EXPORTER || (function () {
  'use strict';

  var VERSION = '1.2.0';
  var EXPORT_HANDOUT_NAME = 'CDE Export JSON';

  function whisper(msg) {
    sendChat('CDE Exporter', '/w gm ' + msg);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function decodeEntities(value) {
    return String(value || '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#(\d+);/g, function (match, n) {
        var code = parseInt(n, 10);
        if (!isNaN(code)) return String.fromCharCode(code);
        return match;
      });
  }

  function htmlToPlain(value) {
    var s = String(value || '');
    s = s
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<img[^>]*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
    return decodeEntities(s).trim();
  }

  function firstImageFromHtml(html) {
    var s = String(html || '');
    var m = s.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (m && m[1]) return decodeEntities(m[1]);
    return '';
  }

  function getAsync(obj, prop, done) {
    var finished = false;
    function finish(value) {
      if (finished) return;
      finished = true;
      done(value || '');
    }
    try {
      var direct = obj.get(prop, function (value) {
        finish(value || '');
      });
      if (typeof direct === 'string' && direct.length) {
        finish(direct);
      }
      if (direct !== undefined && direct !== null && typeof direct !== 'function' && prop !== 'bio' && prop !== 'gmnotes' && prop !== 'notes') {
        finish(direct);
      }
      setTimeout(function () { finish(''); }, 2500);
    } catch (e) {
      try { finish(obj.get(prop) || ''); } catch (err) { finish(''); }
    }
  }

  function series(items, iterator, done) {
    var index = 0;
    var results = [];
    function next() {
      if (index >= items.length) {
        done(results);
        return;
      }
      iterator(items[index], function (result) {
        if (result) results.push(result);
        index += 1;
        next();
      });
    }
    next();
  }

  function parseOptions(content) {
    var opts = {
      includeCharacters: true,
      includeHandouts: true,
      includeArchived: false,
      includeGmNotes: false,
      selectedOnly: false
    };
    String(content || '').split(/\s+/).slice(1).forEach(function (p) {
      if (p === '--characters') opts.includeHandouts = false;
      if (p === '--handouts') opts.includeCharacters = false;
      if (p === '--all') opts.includeArchived = true;
      if (p === '--gmnotes') opts.includeGmNotes = true;
      if (p === '--selected') opts.selectedOnly = true;
    });
    return opts;
  }

  function isArchived(obj) {
    try { return !!obj.get('archived'); } catch (e) { return false; }
  }

  function selectedCharacterIds(msg) {
    var ids = {};
    (msg.selected || []).forEach(function (sel) {
      var tok = getObj('graphic', sel._id);
      if (!tok) return;
      var represents = tok.get('represents');
      if (represents) ids[represents] = true;
    });
    return ids;
  }

  function exportCharacter(ch, opts, done) {
    getAsync(ch, 'bio', function (bioHtml) {
      getAsync(ch, 'gmnotes', function (gmHtml) {
        var avatar = ch.get('avatar') || firstImageFromHtml(bioHtml) || '';
        var bioText = htmlToPlain(bioHtml);
        var row = {
          id: ch.id,
          roll20Id: ch.id,
          sourceId: ch.id,
          type: 'character',
          kind: 'character',
          name: ch.get('name') || 'Personagem sem nome',
          imageUrl: avatar,
          avatar: avatar,
          bio: bioText,
          bioText: bioText,
          bioHtml: bioHtml || '',
          controlledby: ch.get('controlledby') || '',
          inplayerjournals: ch.get('inplayerjournals') || '',
          archived: isArchived(ch)
        };
        if (opts.includeGmNotes) {
          row.gmnotes = htmlToPlain(gmHtml);
          row.gmnotesHtml = gmHtml || '';
        }
        done(row);
      });
    });
  }

  function exportHandout(ho, opts, done) {
    getAsync(ho, 'notes', function (notesHtml) {
      getAsync(ho, 'gmnotes', function (gmHtml) {
        var avatar = ho.get('avatar') || firstImageFromHtml(notesHtml) || '';
        var notesText = htmlToPlain(notesHtml);
        var row = {
          id: ho.id,
          roll20Id: ho.id,
          sourceId: ho.id,
          type: 'handout',
          kind: 'handout',
          name: ho.get('name') || 'Folheto sem título',
          imageUrl: avatar,
          avatar: avatar,
          bio: notesText,
          content: notesText,
          notesText: notesText,
          notesHtml: notesHtml || '',
          inplayerjournals: ho.get('inplayerjournals') || '',
          controlledby: ho.get('controlledby') || '',
          archived: isArchived(ho)
        };
        if (opts.includeGmNotes) {
          row.gmnotes = htmlToPlain(gmHtml);
          row.gmnotesHtml = gmHtml || '';
        }
        done(row);
      });
    });
  }

  function makePayload(charRows, handoutRows, opts) {
    var campaign = (typeof Campaign === 'function') ? Campaign() : null;
    return {
      source: 'roll20-api-script',
      exporter: 'cronicas-do-eter',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      options: opts,
      campaign: {
        name: campaign ? (campaign.get('name') || '') : '',
        playerPageId: campaign ? (campaign.get('playerpageid') || '') : ''
      },
      counts: {
        characters: (charRows || []).length,
        handouts: (handoutRows || []).length
      },
      characters: charRows || [],
      handouts: handoutRows || []
    };
  }

  function saveExportHandout(payload) {
    var json = JSON.stringify(payload, null, 2);
    var existing = findObjs({ _type: 'handout', name: EXPORT_HANDOUT_NAME })[0];
    var handout = existing || createObj('handout', {
      name: EXPORT_HANDOUT_NAME,
      inplayerjournals: '',
      controlledby: ''
    });

    var html = '' +
      '<h3>Crônicas do Éter — Export Roll20</h3>' +
      '<p><b>Data:</b> ' + escapeHtml(payload.exportedAt) + '</p>' +
      '<p><b>Personagens:</b> ' + payload.characters.length + ' | <b>Folhetos:</b> ' + payload.handouts.length + '</p>' +
      '<p>Copie todo o texto abaixo e cole na página <b>Mesas Roll20</b> do site.</p>' +
      '<pre style="white-space:pre-wrap;font-family:monospace;font-size:12px;border:1px solid #999;padding:8px;max-height:600px;overflow:auto;">' + escapeHtml(json) + '</pre>';

    handout.set('notes', html);
    try { handout.set('gmnotes', json); } catch (e) {}
    whisper('Exportação concluída.<br>Personagens: <b>' + payload.characters.length + '</b><br>Folhetos: <b>' + payload.handouts.length + '</b><br>Abra o handout <b>' + EXPORT_HANDOUT_NAME + '</b>, copie o JSON e cole no site.');
  }

  function exportAll(msg) {
    var opts = parseOptions(msg.content);
    whisper('Exportando Bio & Info dos personagens e Notes dos folhetos. Aguarde alguns segundos...');

    var allowedSelected = opts.selectedOnly ? selectedCharacterIds(msg) : null;
    if (opts.selectedOnly && Object.keys(allowedSelected).length === 0) {
      whisper('Nenhum token selecionado representa um personagem. Selecione tokens vinculados ou use <code>!cde-export</code>.');
      return;
    }

    var characters = opts.includeCharacters ? (findObjs({ _type: 'character' }) || []) : [];
    var handouts = opts.includeHandouts ? (findObjs({ _type: 'handout' }) || []) : [];

    characters = characters.filter(function (ch) {
      if (!opts.includeArchived && isArchived(ch)) return false;
      if (allowedSelected && !allowedSelected[ch.id]) return false;
      return true;
    });

    handouts = handouts.filter(function (ho) {
      if (ho.get('name') === EXPORT_HANDOUT_NAME) return false;
      if (!opts.includeArchived && isArchived(ho)) return false;
      return true;
    });

    series(characters, function (ch, next) { exportCharacter(ch, opts, next); }, function (charRows) {
      series(handouts, function (ho, next) { exportHandout(ho, opts, next); }, function (handoutRows) {
        saveExportHandout(makePayload(charRows, handoutRows, opts));
      });
    });
  }

  function help() {
    whisper('<b>Crônicas do Éter — Exportador Roll20 v' + VERSION + '</b><br>' +
      '<code>!cde-export</code> — exporta personagens e folhetos ativos.<br>' +
      '<code>!cde-export --characters</code> — só personagens.<br>' +
      '<code>!cde-export --handouts</code> — só folhetos.<br>' +
      '<code>!cde-export --selected</code> — só personagens dos tokens selecionados.<br>' +
      '<code>!cde-export --all</code> — inclui arquivados.<br>' +
      '<code>!cde-export --gmnotes</code> — inclui GM Notes.<br>' +
      '<br>Depois abra o handout <b>' + EXPORT_HANDOUT_NAME + '</b>, copie o JSON e cole no site.');
  }

  on('chat:message', function (msg) {
    if (msg.type !== 'api') return;
    if (msg.content.indexOf('!cde-export') === 0) exportAll(msg);
    if (msg.content === '!cde-help') help();
  });

  on('ready', function () {
    log('CDE Roll20 Exporter v' + VERSION + ' carregado.');
  });

  return {};
}());
